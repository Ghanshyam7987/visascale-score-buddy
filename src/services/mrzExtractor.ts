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
import {
  extractMrzLines,
  normalizeMrzLines,
  parseNormalizedLines,
  scoreLine1,
  scoreLine2,
} from '@/lib/mrzParser';

const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
// Widen the band sweep so we tolerate different scan margins / scan
// resolutions. Each fraction is the height of the bottom band as a
// fraction of the rotated page height.
const BAND_FRACTIONS = [0.18, 0.22, 0.26, 0.30, 0.35, 0.42] as const;
// Multiple binarisation thresholds — bright scans and shadowy phone
// captures need very different cutoffs.
const BIN_THRESHOLDS = [110, 130, 150, 170] as const;
const ORIENTATIONS: ReadonlyArray<0 | 90 | 180 | 270> = [0, 180, 90, 270];

function emptyFields(): Omit<ExtractedFields, 'status'> {
  return {
    surname: '',
    givenName: '',
    gender: '',
    dateOfBirth: '',
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

interface LineCandidate {
  line: string;
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

  /**
   * Pull every plausible MRZ-shaped line out of a chunk of OCR output
   * (>=30 chars, padded/truncated to 44) and score each as a line-1 or
   * line-2 candidate. Lets us mix-and-match lines across OCR passes.
   */
  private harvestLines(
    text: string,
    bestL1: LineCandidate[],
    bestL2: LineCandidate[],
  ) {
    const raw = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/gi, '').toUpperCase())
      .filter((l) => l.length >= 30)
      .map((l) => l.padEnd(44, '<').slice(0, 44));
    for (const l of raw) {
      const s1 = scoreLine1(l);
      if (s1 >= 3) bestL1.push({ line: l, score: s1 });
      const s2 = scoreLine2(l);
      if (s2 >= 5) bestL2.push({ line: l, score: s2 });
    }
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
      const lineCands: { l1: LineCandidate[]; l2: LineCandidate[] } = {
        l1: [],
        l2: [],
      };

      outer: for (const deg of ORIENTATIONS) {
        const rotated = rotateCanvas(base, deg);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          const band = cropMrzBandAt(rotated, f);
          for (const t of BIN_THRESHOLDS) {
            if (signal?.aborted) throw new Error('aborted');
            const bin = binarize(band, t);
            const text = await this.ocrBand(bin);
            const parsed = parseStrictMrz(text);
            const score = this.scoreCandidate(text, parsed);
            if (!best || score > best.score) {
              best = { text, parsed, rotation: deg, score };
            }
            this.harvestLines(text, lineCands.l1, lineCands.l2);
            // Early exit only when ALL three checksums pass — partial
            // parses still benefit from line-mixing below.
            if (parsed.fields) break outer;
          }
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
          this.harvestLines(text, lineCands.l1, lineCands.l2);
          if (parsed.fields) break;
        }
      }

      // ─── Cross-pass line mixing: pair the best line-1 with the best
      // line-2 from any pass and re-parse. This rescues cases where the
      // top half of the MRZ was best-read at one threshold while the
      // bottom half was best-read at another.
      if (!best?.parsed.fields && lineCands.l1.length && lineCands.l2.length) {
        lineCands.l1.sort((a, b) => b.score - a.score);
        lineCands.l2.sort((a, b) => b.score - a.score);
        const top1 = lineCands.l1.slice(0, 5);
        const top2 = lineCands.l2.slice(0, 5);
        for (const a of top1) {
          for (const b of top2) {
            const [n1, n2] = normalizeMrzLines(a.line, b.line);
            const parsed = parseNormalizedLines([n1, n2]);
            if (parsed && parsed.checks.passport && parsed.checks.dob && parsed.checks.expiry) {
              // Synthesise a Candidate from the mixed pair.
              const text = `${n1}\n${n2}`;
              const strict = parseStrictMrz(text);
              if (strict.fields) {
                best = { text, parsed: strict, rotation: best?.rotation ?? 0, score: 1000 };
                break;
              }
            }
          }
          if (best?.parsed.fields) break;
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
        const out = { ...fields, status: computeStatus(fields, true) };
        return out;
      }

      // Low-confidence read — emit blanks, flag for manual review.
      const blank = emptyFields();
      const out = { ...blank, status: 'review' as const };
      return out;
    } finally {
      if (ownsUrl) URL.revokeObjectURL(url);
    }
  }
}