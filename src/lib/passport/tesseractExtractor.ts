import { createWorker, PSM, Worker as TesseractWorker } from 'tesseract.js';
import { parseMrz, sanitizeName, MRZResult } from '@/lib/mrzParser';
import {
  ExtractOptions,
  ExtractedFields,
  PassportExtractor,
  computeStatus,
} from './types';
import {
  binarize,
  cropCanvas,
  cropMrzBand,
  mrzScore,
  normalizeDate,
  preprocessStrong,
  renderToCanvas,
  rotateCanvas,
  validPlace,
} from './imageOps';

/**
 * Default main-thread extractor. Wraps the existing Tesseract pipeline behind
 * the PassportExtractor contract so the page never imports tesseract directly.
 * A WorkerPoolExtractor implementing the same interface will replace this
 * for true parallel OCR in the next phase.
 */
const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/**
 * Run MRZ OCR on a pre-cropped MRZ-band canvas using the strict whitelist
 * + single-block PSM. Returns the raw OCR text.
 */
async function ocrMrzBand(worker: TesseractWorker, canvas: HTMLCanvasElement): Promise<string> {
  await worker.setParameters({
    tessedit_char_whitelist: MRZ_WHITELIST,
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });
  const res = await worker.recognize(canvas);
  return res.data.text || '';
}

/**
 * Try all 4 cardinal orientations and return the rotation whose
 * bottom-band OCR looks most MRZ-like. Stops early on a valid checksum.
 */
async function autoOrient(
  worker: TesseractWorker,
  base: HTMLCanvasElement,
): Promise<{ canvas: HTMLCanvasElement; mrzText: string; mrz: MRZResult | null }> {
  const orientations: Array<0 | 90 | 180 | 270> = [0, 180, 90, 270];
  let best: { canvas: HTMLCanvasElement; mrzText: string; mrz: MRZResult | null; score: number } = {
    canvas: base,
    mrzText: '',
    mrz: null,
    score: -1,
  };
  for (const deg of orientations) {
    const rotated = rotateCanvas(base, deg);
    const band = cropMrzBand(rotated);
    const bin = binarize(band, 130);
    const text = await ocrMrzBand(worker, bin);
    const parsed = parseMrz(text);
    const score = (parsed?.checksumValid ? 1 : 0) + mrzScore(text);
    if (score > best.score) best = { canvas: rotated, mrzText: text, mrz: parsed, score };
    if (parsed?.checksumValid) break;
  }
  return best;
}

/**
 * Main-thread Tesseract extractor implementing the contract.
 * Pipeline (MRZ-first, region-based, with one preprocessing retry):
 *   preparing → auto-orient → MRZ OCR → ICAO parse → (retry strong) →
 *   validating → upper-page OCR (only for PoB / DoI / PoI) → finished
 */
export class TesseractExtractor implements PassportExtractor {
  private worker: TesseractWorker | null = null;

  async init(): Promise<void> {
    if (this.worker) return;
    this.worker = await createWorker('eng');
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  async extract(source: Blob | string, opts: ExtractOptions = {}): Promise<ExtractedFields> {
    if (!this.worker) await this.init();
    const worker = this.worker!;
    const { onStage, rotationDeg = 0, signal } = opts;

    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const ownsUrl = typeof source !== 'string';

    try {
      onStage?.('preparing');
      const base = await renderToCanvas(url, rotationDeg);
      if (signal?.aborted) throw new Error('aborted');

      // ─── Auto-orient using MRZ band as the orientation oracle ──────
      onStage?.('detecting_mrz');
      let oriented = await autoOrient(worker, base);
      if (signal?.aborted) throw new Error('aborted');

      // ─── MRZ OCR (already done inside autoOrient — reuse text) ─────
      onStage?.('reading_mrz');
      let mrz: MRZResult | null = oriented.mrz;

      // ─── Retry once with stronger preprocessing on soft failure ────
      if (!mrz || !mrz.checksumValid) {
        const band = cropMrzBand(oriented.canvas);
        const strong = preprocessStrong(band);
        const retryText = await ocrMrzBand(worker, strong);
        const retryMrz = parseMrz(retryText);
        if (retryMrz && (!mrz || (retryMrz.confidence > (mrz?.confidence ?? 0)))) {
          mrz = retryMrz;
        }
      }

      onStage?.('validating');

      // ─── Region-only upper-page OCR for fields MRZ can't provide ───
      onStage?.('ocr_upper');
      const W = oriented.canvas.width;
      const H = oriented.canvas.height;
      const upperRaw = cropCanvas(oriented.canvas, 0, 0, W, Math.round(H * 0.78));
      const upperBin = binarize(upperRaw, 150);
      await worker.setParameters({
        tessedit_char_whitelist: '',
        tessedit_pageseg_mode: PSM.AUTO,
      });
      const upperRes = await worker.recognize(upperBin);
      const upperText = upperRes.data.text || '';

      const { placeOfBirth, placeOfIssue, dateOfIssue } = extractUpperFields(
        upperText,
        mrz?.dateOfBirth || '',
        mrz?.dateOfExpiry || '',
      );

      onStage?.('finished');

      if (mrz) {
        const base = {
          surname: sanitizeName(mrz.surname),
          givenName: sanitizeName(mrz.givenName),
          gender: mrz.gender,
          dateOfBirth: mrz.dateOfBirth,
          placeOfBirth,
          dateOfIssue,
          placeOfIssue,
          dateOfExpiry: mrz.dateOfExpiry,
          nationality: mrz.nationality,
          passportNumber: mrz.passportNumber,
        };
        return { ...base, status: computeStatus(base, mrz.checksumValid) };
      }

      // MRZ could not be read after retry — leave MRZ-derived fields blank
      // for manual review. Never fabricate values.
      return {
        status: 'failed',
        surname: '',
        givenName: '',
        gender: '',
        dateOfBirth: '',
        placeOfBirth,
        dateOfIssue,
        placeOfIssue,
        dateOfExpiry: '',
        nationality: '',
        passportNumber: '',
      };
    } finally {
      if (ownsUrl) URL.revokeObjectURL(url);
    }
  }
}

/**
 * Extract Place of Birth / Place of Issue / Date of Issue from upper-page
 * OCR text. Uses label anchoring and date elimination — no AI guessing.
 */
export function extractUpperFields(
  upperText: string,
  mrzDob: string,
  mrzExpiry: string,
): { placeOfBirth: string; placeOfIssue: string; dateOfIssue: string } {
  const lines = upperText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let placeOfBirth = '';
  let placeOfIssue = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!placeOfBirth && /place\s*of\s*birth/i.test(line)) {
      const tail = line.split(/place\s*of\s*birth/i)[1] || '';
      const candidate = tail.replace(/[:\-]/g, '').trim() || lines[i + 1] || '';
      placeOfBirth = validPlace(candidate);
    }
    if (!placeOfIssue && /place\s*of\s*issue/i.test(line)) {
      const tail = line.split(/place\s*of\s*issue/i)[1] || '';
      const candidate = tail.replace(/[:\-]/g, '').trim() || lines[i + 1] || '';
      placeOfIssue = validPlace(candidate);
    }
  }
  if (!placeOfIssue) {
    const poiMatch = upperText.match(/Place of Issue[\s\S]*?([A-Z]{3,})/i);
    if (poiMatch) placeOfIssue = validPlace(poiMatch[1]) || poiMatch[1].toUpperCase();
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD MON YYYY (3-letter month)
  const numericDates = Array.from(
    upperText.matchAll(/\b(\d{2}[/\-.\s]\d{2}[/\-.\s]\d{2,4})\b/g),
  ).map((m) => normalizeDate(m[1]));

  const MONTHS: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const textDates = Array.from(
    upperText.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b/g),
  )
    .map((m) => {
      const mm = MONTHS[m[2].toUpperCase()];
      if (!mm) return '';
      return `${m[1].padStart(2, '0')}/${mm}/${m[3]}`;
    })
    .filter(Boolean);

  const uniqueDates = Array.from(new Set([...numericDates, ...textDates])).filter(Boolean);
  const dateOfIssue = uniqueDates.find((d) => d !== mrzDob && d !== mrzExpiry) || '';

  return { placeOfBirth, placeOfIssue, dateOfIssue };
}