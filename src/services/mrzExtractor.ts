// Phase-1 MRZ Extractor service.
//
// Implements the existing PassportExtractor contract so the UI, the
// pipeline orchestrator, and the worker pool keep using the same
// interface. Internally this replaces the old "OCR the whole page and
// guess" approach with a strict MRZ-only pipeline:
//
//   1. Try 4 cardinal orientations, each with 3 candidate band heights
//      (22% / 28% / 35% of page height).
//   2. OCR each candidate with a tight MRZ whitelist + SINGLE_BLOCK PSM.
//   3. Pick the candidate with the most passing per-field checksums,
//      tiebroken by MRZ-likeness score.
//   4. If no candidate passes all three (passport / DOB / expiry)
//      checksums, retry the best orientation with stronger preprocessing.
//   5. Emit the 7 MRZ fields ONLY when checksums pass. Otherwise leave
//      every field blank — the row will surface as "Review Needed".
//
// We never write to the 3 non-MRZ fields (Place of Birth / Date of Issue
// / Place of Issue) in Phase 1.

import { createWorker, PSM, Worker as TesseractWorker } from 'tesseract.js';
import {
  ExtractOptions,
  ExtractedFields,
  PassportExtractor,
  computeStatus,
} from '@/lib/passport/types';
import { mrzScore } from '@/lib/passport/imageOps';
import {
  binarize,
  cropMrzBandAt,
  preprocessStrong,
  renderToCanvas,
  rotateCanvas,
} from './imagePreprocessor';
import { parseStrictMrz, StrictMrzResult } from './mrzParser';

const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
const BAND_FRACTIONS = [0.22, 0.28, 0.35] as const;
const ORIENTATIONS: ReadonlyArray<0 | 90 | 180 | 270> = [0, 180, 90, 270];

function emptyFields(): Omit<ExtractedFields, 'status'> {
  return {
    surname: '',
    givenName: '',
    gender: '',
    dateOfBirth: '',
    placeOfBirth: '',
    dateOfIssue: '',
    placeOfIssue: '',
    dateOfExpiry: '',
    nationality: '',
    passportNumber: '',
  };
}

interface Candidate {
  text: string;
  parsed: StrictMrzResult;
  rotation: 0 | 90 | 180 | 270;
  score: number;
}

export class MrzExtractor implements PassportExtractor {
  private worker: TesseractWorker | null = null;

  async init(): Promise<void> {
    if (this.worker) return;
    this.worker = await createWorker('eng');
    await this.worker.setParameters({
      tessedit_char_whitelist: MRZ_WHITELIST,
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  private async ocrBand(canvas: HTMLCanvasElement): Promise<string> {
    const w = this.worker!;
    const res = await w.recognize(canvas);
    return res.data.text || '';
  }

  private scoreCandidate(text: string, parsed: StrictMrzResult): number {
    const raw = parsed.raw;
    const checksumScore = raw
      ? (raw.checks.passport ? 1 : 0) +
        (raw.checks.dob ? 1 : 0) +
        (raw.checks.expiry ? 1 : 0)
      : 0;
    return checksumScore * 10 + mrzScore(text);
  }

  async extract(source: Blob | string, opts: ExtractOptions = {}): Promise<ExtractedFields> {
    if (!this.worker) await this.init();
    const { onStage, rotationDeg = 0, signal } = opts;

    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const ownsUrl = typeof source !== 'string';

    try {
      onStage?.('preparing');
      const base = await renderToCanvas(url, rotationDeg);
      if (signal?.aborted) throw new Error('aborted');

      onStage?.('detecting_mrz');
      let best: Candidate | null = null;

      outer: for (const deg of ORIENTATIONS) {
        const rotated = rotateCanvas(base, deg);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          const band = cropMrzBandAt(rotated, f);
          const bin = binarize(band, 130);
          const text = await this.ocrBand(bin);
          const parsed = parseStrictMrz(text);
          const score = this.scoreCandidate(text, parsed);
          if (!best || score > best.score) {
            best = { text, parsed, rotation: deg, score };
          }
          // Early exit on a fully-valid parse.
          if (parsed.fields) break outer;
        }
      }

      onStage?.('reading_mrz');

      // ─── Fallback: retry the best orientation with stronger preprocessing.
      if (!best || !best.parsed.fields) {
        const deg = best?.rotation ?? 0;
        const rotated = rotateCanvas(base, deg);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          const band = cropMrzBandAt(rotated, f);
          const strong = preprocessStrong(band);
          const text = await this.ocrBand(strong);
          const parsed = parseStrictMrz(text);
          const score = this.scoreCandidate(text, parsed);
          if (!best || score > best.score) {
            best = { text, parsed, rotation: deg, score };
          }
          if (parsed.fields) break;
        }
      }

      onStage?.('validating');
      onStage?.('ocr_upper'); // stage kept for UI parity; no upper OCR in Phase 1.
      onStage?.('finished');

      if (best?.parsed.fields) {
        const f = best.parsed.fields;
        const fields: Omit<ExtractedFields, 'status'> = {
          ...emptyFields(),
          surname: f.surname,
          givenName: f.givenName,
          gender: f.gender,
          dateOfBirth: f.dateOfBirth,
          dateOfExpiry: f.dateOfExpiry,
          nationality: f.nationality,
          passportNumber: f.passportNumber,
        };
        return { ...fields, status: computeStatus(fields, true) };
      }

      // Low-confidence read — emit blanks, flag for manual review.
      const blank = emptyFields();
      return { ...blank, status: 'review' };
    } finally {
      if (ownsUrl) URL.revokeObjectURL(url);
    }
  }
}