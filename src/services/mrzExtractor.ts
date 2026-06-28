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
import { enhanceMrz, mrzScore } from '@/lib/passport/imageOps';
import {
  binarize,
  cropMrzBandAt,
  preprocessStrong,
  renderToCanvas,
  rotateCanvas,
  upscale,
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
const BAND_FRACTIONS = [0.20, 0.28, 0.38] as const;
// Multiple binarisation thresholds — bright scans and shadowy phone
// captures need very different cutoffs.
const BIN_THRESHOLDS = [115, 155, 195] as const;
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
    // Stable configuration: use the bundled English Tesseract model.
    // All accuracy improvements live in the preprocessing pipeline.
    this.worker = await createWorker('eng');
    await this.worker.setParameters({
      tessedit_char_whitelist: MRZ_WHITELIST,
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      // ── MRZ-font tuning ──
      // Disable every Tesseract dictionary / language model. The English
      // model otherwise treats long runs of ICAO filler `<` characters
      // as "impossible" and silently rewrites them into the visually
      // closest letters (K, C, L, I, T…), which is exactly the
      // KESAR<DEVI<<<<  →  KKESARCDEVICKKK corruption seen on Indian
      // passports. With every DAWG off Tesseract reports raw glyph
      // shape only, preserving every `<` filler verbatim.
      load_system_dawg: '0',
      load_freq_dawg: '0',
      load_unambig_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
      load_bigram_dawg: '0',
      // Don't penalise non-dictionary words — MRZ is by definition
      // never in any dictionary.
      language_model_penalty_non_dict_word: '0',
      language_model_penalty_non_freq_dict_word: '0',
      // Keep the literal character grid — never merge / drop spaces
      // between glyphs inside the MRZ line.
      preserve_interword_spaces: '1',
    });
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  private async ocrBand(
    canvas: HTMLCanvasElement,
  ): Promise<{ text: string; confidence: number }> {
    const w = this.worker!;
    const res = await w.recognize(canvas);
    return {
      text: res.data.text || '',
      confidence: typeof res.data.confidence === 'number' ? res.data.confidence : 0,
    };
  }

  private scoreCandidate(
    text: string,
    parsed: StrictMrzResult,
    confidence = 0,
  ): number {
    const raw = parsed.raw;
    const checksumScore = raw
      ? (raw.checks.passport ? 1 : 0) +
        (raw.checks.dob ? 1 : 0) +
        (raw.checks.expiry ? 1 : 0)
      : 0;
    return checksumScore * 10 + mrzScore(text) + confidence / 200;
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
      let foundValid = false;

      outer: for (const deg of ORIENTATIONS) {
        const rotated = rotateCanvas(base, deg);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          // Upscale narrow bands so Tesseract sees ~30-40px x-height.
          // This is the single biggest win on older Indian passports
          // whose MRZ font prints small relative to the page width.
          const rawBand = cropMrzBandAt(rotated, f);
          const band = rawBand.height < 140 ? upscale(rawBand, 2) : rawBand;
          // Preprocessing variants — keep every `<` intact, just vary
          // the binarisation strategy. We always include the new
          // adaptive-threshold + sharpen pipeline alongside the legacy
          // global-threshold sweep, then keep whichever OCR pass yields
          // the best score (checksums + MRZ-likeness + confidence).
          const variants: HTMLCanvasElement[] = [
            enhanceMrz(band),
            ...BIN_THRESHOLDS.map((t) => binarize(band, t)),
          ];
          for (const variant of variants) {
            if (signal?.aborted) throw new Error('aborted');
            const { text, confidence } = await this.ocrBand(variant);
            // Always harvest line candidates — even after a checksum-valid
            // hit, we keep collecting cleaner line-1s so the name-upgrade
            // pass below can replace OCR-garbled given names.
            this.harvestLines(text, lineCands.l1, lineCands.l2);
            const parsed = parseStrictMrz(text);
            const score = this.scoreCandidate(text, parsed, confidence);
            if (!best || score > best.score) {
              best = { text, parsed, rotation: deg, score };
            }
            if (parsed.fields) foundValid = true;
          }
          if (foundValid) break;
        }
        if (foundValid) break outer;
      }

      onStage?.('reading_mrz');

      // ─── Fallback: retry the best orientation with stronger preprocessing.
      if (!best || !best.parsed.fields) {
        const deg = best?.rotation ?? 0;
        const rotated = rotateCanvas(base, deg);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          const rawBand = cropMrzBandAt(rotated, f);
          const band = rawBand.height < 140 ? upscale(rawBand, 2) : rawBand;
          const strong = preprocessStrong(band);
          const { text, confidence } = await this.ocrBand(strong);
          const parsed = parseStrictMrz(text);
          const score = this.scoreCandidate(text, parsed, confidence);
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

      // ─── Name-upgrade pass: when we already have a checksum-valid
      // candidate but the OCR happened to misread `<` fillers in the
      // name field as letters (e.g. `KESAR<DEVI` → `KKESARCDEVICK`),
      // swap in the best harvested line-1 (highest filler/structure
      // score) paired against the winning line-2. We only accept the
      // replacement if it still validates against the same passport/
      // DOB/expiry checksums AND yields a strictly cleaner name field
      // (more `<` fillers in positions 5-43).
      if (best?.parsed.fields && lineCands.l1.length) {
        const winLines = extractMrzLines(best.text);
        if (winLines) {
          const fillerCount = (s: string) => (s.match(/</g) || []).length;
          const currentName = winLines[0].slice(5, 44);
          const currentFillers = fillerCount(currentName);
          lineCands.l1.sort((a, b) => b.score - a.score);
          for (const c of lineCands.l1.slice(0, 10)) {
            const candName = c.line.slice(5, 44);
            if (fillerCount(candName) <= currentFillers) continue;
            const [n1, n2] = normalizeMrzLines(c.line, winLines[1]);
            const strict = parseStrictMrz(`${n1}\n${n2}`);
            if (
              strict.fields &&
              strict.fields.passportNumber === best.parsed.fields.passportNumber &&
              strict.fields.dateOfBirth === best.parsed.fields.dateOfBirth &&
              strict.fields.dateOfExpiry === best.parsed.fields.dateOfExpiry &&
              strict.fields.surname &&
              strict.fields.givenName
            ) {
              best = { ...best, parsed: strict, text: `${n1}\n${n2}` };
              break;
            }
          }
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