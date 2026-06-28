import { createWorker, PSM } from 'tesseract.js';
import { parseMrz, sanitizeName } from '@/lib/mrzParser';
import {
  ExtractOptions,
  ExtractedFields,
  PassportExtractor,
  computeStatus,
} from './types';
import {
  binarize,
  cropCanvas,
  normalizeDate,
  renderToCanvas,
  validPlace,
} from './imageOps';

/**
 * Default main-thread extractor. Wraps the existing Tesseract pipeline behind
 * the PassportExtractor contract so the page never imports tesseract directly.
 * A WorkerPoolExtractor implementing the same interface will replace this
 * for true parallel OCR in the next phase.
 */
export class TesseractExtractor implements PassportExtractor {
  private worker: Tesseract.Worker | null = null;

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
    const { onStage, rotationDeg = 0 } = opts;

    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const ownsUrl = typeof source !== 'string';

    try {
      onStage?.('preparing');
      const baseCanvas = await renderToCanvas(url, rotationDeg);
      const W = baseCanvas.width;
      const H = baseCanvas.height;

      onStage?.('detecting_mrz');
      const upperRaw = cropCanvas(baseCanvas, 0, 0, W, Math.round(H * 0.8));
      const upperBin = binarize(upperRaw, 150);
      const mrzRaw = cropCanvas(baseCanvas, 0, Math.round(H * 0.78), W, Math.round(H * 0.22));
      const mrzBin = binarize(mrzRaw, 130);

      onStage?.('reading_mrz');
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      const mrzRes = await worker.recognize(mrzBin);
      const mrz = parseMrz(mrzRes.data.text || '');

      onStage?.('ocr_upper');
      await worker.setParameters({
        tessedit_char_whitelist: '',
        tessedit_pageseg_mode: PSM.AUTO,
      });
      const upperRes = await worker.recognize(upperBin);
      const upperText = upperRes.data.text || '';
      const upperLines = upperText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      onStage?.('validating');
      let placeOfBirth = '';
      let placeOfIssue = '';
      for (let i = 0; i < upperLines.length; i++) {
        const line = upperLines[i];
        if (!placeOfBirth && /place\s*of\s*birth/i.test(line)) {
          const tail = line.split(/place\s*of\s*birth/i)[1] || '';
          const candidate = tail.replace(/[:\-]/g, '').trim() || upperLines[i + 1] || '';
          placeOfBirth = validPlace(candidate);
        }
        if (!placeOfIssue && /place\s*of\s*issue/i.test(line)) {
          const tail = line.split(/place\s*of\s*issue/i)[1] || '';
          const candidate = tail.replace(/[:\-]/g, '').trim() || upperLines[i + 1] || '';
          placeOfIssue = validPlace(candidate);
        }
      }
      if (!placeOfIssue) {
        const poiMatch = upperText.match(/Place of Issue[\s\S]*?([A-Z]{3,})/i);
        if (poiMatch) placeOfIssue = validPlace(poiMatch[1]) || poiMatch[1].toUpperCase();
      }

      const dateMatches = Array.from(
        upperText.matchAll(/\b(\d{2}[/\-.\s]\d{2}[/\-.\s]\d{2,4})\b/g),
      )
        .map((m) => normalizeDate(m[1]))
        .filter(Boolean);
      const uniqueDates = Array.from(new Set(dateMatches));

      const dob = mrz?.dateOfBirth || '';
      const expiry = mrz?.dateOfExpiry || '';
      const dateOfIssue = uniqueDates.find((d) => d !== dob && d !== expiry) || '';

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

      return {
        status: 'review',
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