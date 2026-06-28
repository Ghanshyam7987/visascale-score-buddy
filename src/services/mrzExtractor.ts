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
import { enhanceMrz } from '@/lib/passport/imageOps';
import {
  binarize,
  cropMrzBandAt,
  preprocessStrong,
  renderToCanvas,
  rotateCanvas,
  upscale,
  splitMrzHalves,
  stretchHorizontal,
} from './imagePreprocessor';
import { parseStrictMrz, StrictMrzResult } from './mrzParser';
import {
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
// Horizontal stretch factors applied ONLY to the Line-1 half. Wider
// glyphs give the OCR-B classifier more pixels per chevron, which is
// the single biggest contributor to filler-vs-letter accuracy.
const L1_STRETCH = [1.0, 1.4, 1.8] as const;

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
      // SINGLE_LINE: every OCR call below operates on exactly one MRZ
      // line (top or bottom half of the band). Telling Tesseract this
      // up-front prevents the layout analyser from guessing line
      // boundaries — which is what causes filler runs to be reflowed
      // into alphabetic letters.
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
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
      // Disable character chopping / association — both can cause
      // Tesseract to split a `<` chevron into two strokes and then
      // re-glue them into an alphabetic letter. Keeping each glyph
      // atomic preserves filler recognition.
      chop_enable: '0',
      wordrec_enable_assoc: '0',
      // MRZ scans are always printed dark-on-light; skip Tesseract's
      // auto-invert pass which can degrade thin diagonal strokes.
      tessedit_do_invert: '0',
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

  /**
   * Normalise a single OCR-produced MRZ line: strip whitespace, drop
   * non-MRZ characters, upper-case, then pad/truncate to the ICAO 44-
   * column width.
   */
  private cleanLine(text: string): string | null {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/gi, '').toUpperCase())
      .filter((l) => l.length >= 20);
    if (!lines.length) return null;
    // Pick the longest — Tesseract sometimes splits a single MRZ line
    // into multiple short fragments.
    lines.sort((a, b) => b.length - a.length);
    return lines[0].padEnd(44, '<').slice(0, 44);
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
      // V2 architecture: split the MRZ band into Line 1 / Line 2 halves
      // and OCR each half INDEPENDENTLY with PSM.SINGLE_LINE. Line 1
      // gets extra horizontal-stretch variants because preserving the
      // chevron `<` filler against alphabetic letters is bottlenecked
      // by horizontal resolution. Line 2 keeps the existing variant
      // set — its accuracy is already acceptable.
      let best: Candidate | null = null;
      const lineCands: { l1: LineCandidate[]; l2: LineCandidate[] } = {
        l1: [],
        l2: [],
      };
      let foundValid = false;
      let bestRotation: 0 | 90 | 180 | 270 = 0;

      const harvestL1 = (text: string) => {
        const clean = this.cleanLine(text);
        if (!clean) return;
        const s = scoreLine1(clean);
        if (s >= 3) lineCands.l1.push({ line: clean, score: s });
      };
      const harvestL2 = (text: string) => {
        const clean = this.cleanLine(text);
        if (!clean) return;
        const s = scoreLine2(clean);
        if (s >= 5) lineCands.l2.push({ line: clean, score: s });
      };

      outer: for (const deg of ORIENTATIONS) {
        const rotated = rotateCanvas(base, deg);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          const rawBand = cropMrzBandAt(rotated, f);
          const band =
            rawBand.height < 220
              ? upscale(rawBand, Math.max(2, Math.ceil(220 / Math.max(1, rawBand.height))))
              : rawBand;
          const [topRaw, bottomRaw] = splitMrzHalves(band);

          // ── Line 2 (bottom half): single-line OCR, default variants.
          const l2Variants: HTMLCanvasElement[] = [
            enhanceMrz(bottomRaw, 120),
            ...BIN_THRESHOLDS.map((t) => binarize(bottomRaw, t)),
          ];
          for (const v of l2Variants) {
            if (signal?.aborted) throw new Error('aborted');
            const { text } = await this.ocrBand(v);
            harvestL2(text);
          }

          // ── Line 1 (top half): single-line OCR, horizontal-stretch
          // sweep on top of the threshold sweep. Stretching preserves
          // chevron diagonals; thresholding handles uneven lighting.
          for (const stretch of L1_STRETCH) {
            const stretched =
              stretch > 1 ? stretchHorizontal(topRaw, stretch) : topRaw;
            const l1Variants: HTMLCanvasElement[] = [
              enhanceMrz(stretched, 240),
              ...BIN_THRESHOLDS.map((t) => binarize(stretched, t)),
            ];
            for (const v of l1Variants) {
              if (signal?.aborted) throw new Error('aborted');
              const { text } = await this.ocrBand(v);
              harvestL1(text);
            }
          }

          // ── After each band fraction, try to mix the best L1/L2
          // collected so far. If the existing parser accepts the pair
          // with all three checksums valid we stop here.
          const mixed = this.bestPair(lineCands);
          if (mixed) {
            best = { ...mixed, rotation: deg, score: 1000 };
            bestRotation = deg;
            foundValid = true;
            break;
          }
        }
        if (foundValid) break outer;
        bestRotation = deg;
      }

      onStage?.('reading_mrz');

      // ─── Fallback: stronger preprocessing on each half at the most
      // promising orientation, then re-mix.
      if (!best?.parsed.fields) {
        const rotated = rotateCanvas(base, bestRotation);
        for (const f of BAND_FRACTIONS) {
          if (signal?.aborted) throw new Error('aborted');
          const rawBand = cropMrzBandAt(rotated, f);
          const band =
            rawBand.height < 220
              ? upscale(rawBand, Math.max(2, Math.ceil(220 / Math.max(1, rawBand.height))))
              : rawBand;
          const [topRaw, bottomRaw] = splitMrzHalves(band);
          const strongTop = preprocessStrong(stretchHorizontal(topRaw, 1.6));
          const strongBot = preprocessStrong(bottomRaw);
          const t1 = await this.ocrBand(strongTop);
          harvestL1(t1.text);
          const t2 = await this.ocrBand(strongBot);
          harvestL2(t2.text);
          const mixed = this.bestPair(lineCands);
          if (mixed) {
            best = { ...mixed, rotation: bestRotation, score: 1000 };
            break;
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

  /**
   * Score-and-mix the best Line-1 against the best Line-2. Iterates
   * the top candidates of each bucket; the FIRST pair that produces a
   * fully checksum-valid parse from the existing strict parser wins.
   *
   * Line-1 ranking uses the existing scoreLine1, which already
   * prioritises: valid ICAO structure, `<<` surname separator,
   * filler-tail length, and penalises alphabetic noise after fillers.
   * We additionally tiebreak by filler-count to bias toward the
   * cleanest filler reading — exactly the property that decides
   * Given-Name correctness.
   */
  private bestPair(buckets: {
    l1: LineCandidate[];
    l2: LineCandidate[];
  }): { text: string; parsed: StrictMrzResult } | null {
    if (!buckets.l1.length || !buckets.l2.length) return null;
    const fillerCount = (s: string) => (s.match(/</g) || []).length;
    const dedup = (arr: LineCandidate[]) => {
      const seen = new Set<string>();
      return arr.filter((c) => (seen.has(c.line) ? false : (seen.add(c.line), true)));
    };
    const l1Sorted = dedup([...buckets.l1]).sort(
      (a, b) => b.score - a.score || fillerCount(b.line) - fillerCount(a.line),
    );
    const l2Sorted = dedup([...buckets.l2]).sort((a, b) => b.score - a.score);
    const top1 = l1Sorted.slice(0, 8);
    const top2 = l2Sorted.slice(0, 6);
    for (const a of top1) {
      for (const b of top2) {
        const [n1, n2] = normalizeMrzLines(a.line, b.line);
        const parsed = parseNormalizedLines([n1, n2]);
        if (
          parsed &&
          parsed.checks.passport &&
          parsed.checks.dob &&
          parsed.checks.expiry
        ) {
          const text = `${n1}\n${n2}`;
          const strict = parseStrictMrz(text);
          if (strict.fields) return { text, parsed: strict };
        }
      }
    }
    return null;
  }
}