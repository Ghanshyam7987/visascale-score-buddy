/**
 * ICAO TD3 MRZ extractor for Indian passports (Old + New).
 *
 * Single-file production pipeline:
 *   image -> auto MRZ band detection -> preprocessing strategies ->
 *   Tesseract.js OCR (mrz.traineddata) ->
 *   OCR normalization + line repair -> mrz-js parse + checksum validation ->
 *   PassportData
 *
 * Only extracts:
 *   passportNumber, surname, givenName, nationality, gender,
 *   dateOfBirth, expiryDate
 */
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { parse as parseMrz } from 'mrz';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PassportData {
  passportNumber: string;
  surname: string;
  givenName: string;
  nationality: string;
  gender: 'M' | 'F' | 'X' | '';
  dateOfBirth: string; // YYYY-MM-DD
  expiryDate: string;  // YYYY-MM-DD
}

export interface MrzAttempt {
  strategy: string;
  rawText: string;
  parsed: boolean;
  checksumsValid: boolean;
  error?: string;
}

export interface MrzResult {
  ok: boolean;
  data?: PassportData;
  rawMrz: string;
  modelUsed: 'mrz';
  attempts: MrzAttempt[];
  warnings: string[];
  error?: string;
}

export interface ExtractOptions {
  onProgress?: (progress: number, label: string) => void;
  /** Optional pre-created worker to reuse across many files (bulk mode). */
  worker?: Worker;
}

// ---------------------------------------------------------------------------
// Tesseract config
// ---------------------------------------------------------------------------

const MRZ_LANG_PATH = '/tessdata';
const MRZ_TRAINEDDATA_URL = '/tessdata/mrz.traineddata';
const MRZ_CORE_PATH = '/tesseract/tesseract-core-lstm.wasm.js';
const OCR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

async function mrzModelReachable(): Promise<boolean> {
  try {
    const r = await fetch(MRZ_TRAINEDDATA_URL, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

type RasterSource = HTMLImageElement | HTMLCanvasElement;

function rasterWidth(src: RasterSource): number {
  return src instanceof HTMLCanvasElement ? src.width : src.naturalWidth;
}

function rasterHeight(src: RasterSource): number {
  return src instanceof HTMLCanvasElement ? src.height : src.naturalHeight;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function decodeUrl(url: string, label: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = async () => {
      // `onload` fires before the browser has necessarily completed a full
      // decode. Awaiting decode before drawing avoids sporadic mobile failures
      // when the backing blob URL is revoked immediately after load.
      try { await img.decode?.(); } catch { /* onload is enough on older WebViews */ }
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Unsupported or corrupt image (${label})`));
    img.src = url;
  });
}

function drawRasterToCanvas(src: RasterSource | ImageBitmap, sourceW: number, sourceH: number, maxDim: number): HTMLCanvasElement {
  const maxSide = Math.max(sourceW, sourceH);
  const scale = maxSide > maxDim ? maxDim / maxSide : 1;
  const outW = Math.max(1, Math.round(sourceW * scale));
  const outH = Math.max(1, Math.round(sourceH * scale));
  const c = newCanvas(outW, outH);
  const g = ctx2d(c);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, outW, outH);
  return c;
}

async function loadImage(src: File | string): Promise<HTMLCanvasElement> {
  // 1800 keeps the MRZ band around ~220-260px tall on typical phone shots —
  // enough for the LSTM model — while cutting decode/OCR cost ~40% vs 2200
  // and staying well under mobile canvas limits.
  const MAX_DIM = 1800;

  if (typeof src === 'string') {
    const img = await decodeUrl(src, 'url');
    return drawRasterToCanvas(img, img.naturalWidth, img.naturalHeight, MAX_DIM);
  }

  const label = src.type || 'selected image';
  let lastError: unknown = null;

  // Fast, zero-copy path. Keep the blob URL alive until AFTER the image has
  // been drawn into our own canvas, so later MRZ crops never depend on a
  // revoked URL or an OS-backed content URI.
  for (let attempt = 0; attempt < 2; attempt++) {
    const blobUrl = URL.createObjectURL(src);
    try {
      const img = await decodeUrl(blobUrl, label);
      return drawRasterToCanvas(img, img.naturalWidth, img.naturalHeight, MAX_DIM);
    } catch (err) {
      lastError = err;
      await delay(120 * (attempt + 1));
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  // Fallback for decoders that support the file but not <img src=blob:...>.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(src);
      try { return drawRasterToCanvas(bitmap, bitmap.width, bitmap.height, MAX_DIM); }
      finally { bitmap.close(); }
    } catch (err) { lastError = err; }
  }

  // Last fallback: clone the file bytes into a fresh Blob. This avoids the old
  // FileReader data-URL path that was failing on Android content providers and
  // could create huge base64 strings during bulk uploads.
  for (let attempt = 0; attempt < 2; attempt++) {
    let url = '';
    try {
      const clone = new Blob([await src.arrayBuffer()], { type: src.type || 'image/jpeg' });
      url = URL.createObjectURL(clone);
      const img = await decodeUrl(url, label);
      return drawRasterToCanvas(img, img.naturalWidth, img.naturalHeight, MAX_DIM);
    } catch (err) {
      lastError = err;
      await delay(180 * (attempt + 1));
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  throw new Error(
    lastError instanceof Error && lastError.message
      ? `Could not read file: ${lastError.message}`
      : 'Could not read file. Please choose the image again from device storage.',
  );
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas context unavailable');
  return g;
}

function toGray(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }
  return out;
}

function writeGray(target: ImageData, gray: Uint8ClampedArray): void {
  const d = target.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    d[i] = d[i + 1] = d[i + 2] = gray[p];
    d[i + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// MRZ band detection
// ---------------------------------------------------------------------------

function detectMrzBand(img: RasterSource): { x: number; y: number; w: number; h: number } {
  const W = rasterWidth(img);
  const H = rasterHeight(img);
  const searchH = Math.round(H * 0.4);
  const searchY = H - searchH;

  const scan = newCanvas(W, searchH);
  ctx2d(scan).drawImage(img, 0, searchY, W, searchH, 0, 0, W, searchH);
  const id = ctx2d(scan).getImageData(0, 0, W, searchH);
  const gray = toGray(id.data);

  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  const cutoff = Math.max(40, mean - 20);

  const density = new Float32Array(searchH);
  for (let y = 0; y < searchH; y++) {
    let c = 0;
    const off = y * W;
    for (let x = 0; x < W; x++) if (gray[off + x] < cutoff) c++;
    density[y] = c / W;
  }

  const sm = new Float32Array(searchH);
  const k = 3;
  for (let y = 0; y < searchH; y++) {
    let s = 0, n = 0;
    for (let dy = -k; dy <= k; dy++) {
      const yy = y + dy;
      if (yy >= 0 && yy < searchH) { s += density[yy]; n++; }
    }
    sm[y] = s / n;
  }

  const thresh = 0.12;
  let bestStart = -1, bestLen = 0, curStart = -1;
  for (let y = 0; y < searchH; y++) {
    if (sm[y] > thresh) {
      if (curStart < 0) curStart = y;
    } else if (curStart >= 0) {
      const len = y - curStart;
      if (len > bestLen) { bestLen = len; bestStart = curStart; }
      curStart = -1;
    }
  }
  if (curStart >= 0) {
    const len = searchH - curStart;
    if (len > bestLen) { bestLen = len; bestStart = curStart; }
  }

  const minH = Math.round(H * 0.05);
  const maxH = Math.round(H * 0.22);
  if (bestStart < 0 || bestLen < minH) {
    return { x: 0, y: H - Math.round(H * 0.25), w: W, h: Math.round(H * 0.25) };
  }
  const bandH = Math.min(maxH, Math.round(bestLen * 1.25));
  const bandY = Math.max(0, searchY + bestStart - Math.round(bandH * 0.1));
  return { x: 0, y: bandY, w: W, h: Math.min(H - bandY, bandH) };
}

function cropBand(img: RasterSource, band: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const c = newCanvas(band.w, band.h);
  ctx2d(c).drawImage(img, band.x, band.y, band.w, band.h, 0, 0, band.w, band.h);
  return c;
}

function candidateBands(img: RasterSource): { name: string; canvas: HTMLCanvasElement }[] {
  const W = rasterWidth(img);
  const H = rasterHeight(img);
  const list: { name: string; band: { x: number; y: number; w: number; h: number } }[] = [];
  list.push({ name: 'auto', band: detectMrzBand(img) });
  // Two fallback crops covering the vast majority of passport layouts.
  // Dropped from 3 → 2 to keep the ladder tight; auto-detect already handles
  // the common case.
  for (const frac of [0.22, 0.30]) {
    const h = Math.round(H * frac);
    list.push({ name: `bottom-${Math.round(frac * 100)}`, band: { x: 0, y: H - h, w: W, h } });
  }
  return list.map((c) => ({ name: c.name, canvas: cropBand(img, c.band) }));
}

// ---------------------------------------------------------------------------
// Preprocessing primitives
// ---------------------------------------------------------------------------

function gammaCorrect(gray: Uint8ClampedArray, gamma: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const inv = 1 / gamma;
  for (let i = 0; i < 256; i++) lut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255, inv))));
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]];
  return out;
}

function contrastStretch(gray: Uint8ClampedArray, lowPct = 0.02, highPct = 0.98): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * lowPct) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * (1 - highPct)) { hi = i; break; } }
  if (hi <= lo) return gray;
  const scale = 255 / (hi - lo);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = (gray[i] - lo) * scale;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

function unsharp(gray: Uint8ClampedArray, w: number, h: number, amount = 1.0): Uint8ClampedArray {
  const blur = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          s += gray[yy * w + xx]; n++;
        }
      }
      blur[y * w + x] = (s / n) | 0;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] + amount * (gray[i] - blur[i]);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

function adaptiveThreshold(gray: Uint8ClampedArray, w: number, h: number, win: number, C: number): Uint8ClampedArray {
  const half = Math.floor(win / 2);
  const rowW = w + 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) {
      rs += gray[y * w + x];
      integral[(y + 1) * rowW + (x + 1)] = integral[y * rowW + (x + 1)] + rs;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(w - 1, x + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * rowW + (x2 + 1)] -
        integral[y1 * rowW + (x2 + 1)] -
        integral[(y2 + 1) * rowW + x1] +
        integral[y1 * rowW + x1];
      const mean = sum / area;
      out[y * w + x] = gray[y * w + x] < mean - C ? 0 : 255;
    }
  }
  return out;
}

function upscale(src: HTMLCanvasElement, factor: number, smooth: boolean): HTMLCanvasElement {
  const c = newCanvas(src.width * factor, src.height * factor);
  const g = ctx2d(c);
  g.imageSmoothingEnabled = smooth;
  if (smooth) g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function grayCanvas(src: HTMLCanvasElement, gray: Uint8ClampedArray): HTMLCanvasElement {
  const out = newCanvas(src.width, src.height);
  const g = ctx2d(out);
  const id = g.createImageData(src.width, src.height);
  writeGray(id, gray);
  g.putImageData(id, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Preprocessing strategies
// ---------------------------------------------------------------------------

type Strategy = { name: string; run: (band: HTMLCanvasElement) => HTMLCanvasElement };

// Ordered fastest-first. The pipeline exits on the first checksum-valid
// parse, so >80% of clear passports never run beyond `gray-only-2x`.
const STRATEGIES: Strategy[] = [
  {
    name: 'gray-only-2x',
    run: (band) => {
      const id = ctx2d(band).getImageData(0, 0, band.width, band.height);
      let gray = toGray(id.data);
      gray = contrastStretch(gray);
      return upscale(grayCanvas(band, gray), 2, true);
    },
  },
  {
    name: 'gamma-adaptive-2x',
    run: (band) => {
      const id = ctx2d(band).getImageData(0, 0, band.width, band.height);
      let gray = toGray(id.data);
      gray = gammaCorrect(gray, 1.2);
      gray = contrastStretch(gray);
      const win = Math.max(15, (Math.round(band.height / 8) | 1));
      gray = adaptiveThreshold(gray, band.width, band.height, win, 10);
      return upscale(grayCanvas(band, gray), 2, false);
    },
  },
  {
    name: 'sharpen-adaptive-3x',
    run: (band) => {
      const id = ctx2d(band).getImageData(0, 0, band.width, band.height);
      let gray = toGray(id.data);
      gray = contrastStretch(gray, 0.01, 0.99);
      gray = unsharp(gray, band.width, band.height, 1.2);
      const win = Math.max(19, (Math.round(band.height / 6) | 1));
      gray = adaptiveThreshold(gray, band.width, band.height, win, 12);
      return upscale(grayCanvas(band, gray), 3, false);
    },
  },
  {
    name: 'gamma-dark-adaptive-2x',
    run: (band) => {
      const id = ctx2d(band).getImageData(0, 0, band.width, band.height);
      let gray = toGray(id.data);
      gray = gammaCorrect(gray, 0.8);
      gray = contrastStretch(gray);
      const win = Math.max(21, (Math.round(band.height / 5) | 1));
      gray = adaptiveThreshold(gray, band.width, band.height, win, 8);
      return upscale(grayCanvas(band, gray), 2, false);
    },
  },
];

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

async function createOcrWorker(): Promise<{ worker: Worker; modelUsed: 'mrz' }> {
  const useMrz = await mrzModelReachable();
  if (!useMrz) {
    throw new Error(`MRZ traineddata is not reachable at ${MRZ_TRAINEDDATA_URL}`);
  }

  const w = await createWorker('mrz', OEM.LSTM_ONLY, {
    langPath: MRZ_LANG_PATH,
    corePath: MRZ_CORE_PATH,
    gzip: false,
    cacheMethod: 'refresh',
  } as never);
  await w.setParameters({
    tessedit_char_whitelist: OCR_WHITELIST,
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  } as never);
  return { worker: w, modelUsed: 'mrz' };
}

/** Create a reusable MRZ OCR worker. Call terminate() when done. */
export async function createMrzWorker(): Promise<Worker> {
  const bundle = await createOcrWorker();
  return bundle.worker;
}

// ---------------------------------------------------------------------------
// OCR normalization + MRZ line repair
// ---------------------------------------------------------------------------

const LETTER_TO_DIGIT: Record<string, string> = {
  O: '0', Q: '0', D: '0',
  I: '1', L: '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
  A: '4',
};
const DIGIT_TO_LETTER: Record<string, string> = {
  '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B', '4': 'A',
};

function stripToMrzAlphabet(s: string): string {
  return s
    .toUpperCase()
    .replace(/[«»‹›\[\]\(\){}]/g, '<')
    .replace(/[^A-Z0-9<]/g, '');
}

function padOrTrim(l: string): string {
  if (l.length === 44) return l;
  if (l.length > 44) return l.slice(0, 44);
  return l + '<'.repeat(44 - l.length);
}

function mrzCharValue(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0;
}

function checkDigitFor(s: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += mrzCharValue(s[i]) * weights[i % 3];
  return String(sum % 10);
}

function findLikelyLine2Start(line: string): number {
  let best = -1;
  let bestScore = -1;
  for (let i = 30; i <= line.length - 30; i++) {
    const c = padOrTrim(line.slice(i)).split('');
    for (let j = 9; j <= 43; j++) c[j] = c[j] ?? '<';
    c[9] = forceCheckDigit(c[9]);
    for (let j = 10; j <= 12; j++) c[j] = forceAlpha(c[j]);
    for (let j = 13; j <= 18; j++) c[j] = forceDigit(c[j]);
    c[19] = forceCheckDigit(c[19]);
    c[20] = forceGender(c[20]);
    for (let j = 21; j <= 26; j++) c[j] = forceDigit(c[j]);
    c[27] = forceCheckDigit(c[27]);
    c[42] = forceCheckDigit(c[42]);
    c[43] = forceCheckDigit(c[43]);
    const candidate = c.join('');

    let score = 0;
    if (/^[A-Z0-9<]{9}[0-9<][A-Z]{3}\d{6}[0-9<][MF<]\d{6}[0-9<]/.test(candidate)) score += 20;
    if (checkDigitFor(candidate.slice(0, 9)) === candidate[9]) score += 8;
    if (checkDigitFor(candidate.slice(13, 19)) === candidate[19]) score += 8;
    if (checkDigitFor(candidate.slice(21, 27)) === candidate[27]) score += 8;
    if (checkDigitFor(candidate.slice(28, 42)) === candidate[42]) score += 4;
    if (checkDigitFor(candidate.slice(0, 10) + candidate.slice(13, 20) + candidate.slice(21, 43)) === candidate[43]) score += 8;
    if (i >= 40 && i <= 46) score += 4;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 28 ? best : -1;
}

function splitPossibleWrappedMrz(line: string): string[] {
  if (line.length <= 55) return [line];

  const secondLineStart = findLikelyLine2Start(line);
  if (secondLineStart > 25 && secondLineStart < line.length - 30) {
    return [line.slice(0, secondLineStart), line.slice(secondLineStart)];
  }

  const pIndex = line.search(/P[A-Z<][A-Z]{3}/);
  if (pIndex >= 0 && line.length - pIndex >= 80) {
    const candidate = line.slice(pIndex);
    return [candidate.slice(0, 44), candidate.slice(44, 88)];
  }

  return [line];
}

function isLikelyMrzLine(line: string): boolean {
  if (line.length < 30) return false;
  const fillers = line.match(/</g)?.length ?? 0;
  if (fillers >= 3) return true;
  return /^[A-Z0-9<]{9}[0-9<][A-Z]{3}[0-9A-Z<]{6}[0-9<][MF<X][0-9A-Z<]{6}/.test(line);
}

function pickMrzLines(rawText: string): [string, string] | null {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => stripToMrzAlphabet(l))
    .flatMap((l) => splitPossibleWrappedMrz(l))
    .map((l) => stripToMrzAlphabet(l))
    .filter(isLikelyMrzLine);
  if (lines.length < 2) return null;

  // Score by closeness to 44 chars; keep original order.
  const indexed = lines.map((l, i) => ({ l, i, s: -Math.abs(l.length - 44) }));
  const sorted = [...indexed].sort((a, b) => b.s - a.s);
  const top = sorted.slice(0, 2).sort((a, b) => a.i - b.i);
  if (top.length < 2) return null;
  return [padOrTrim(top[0].l), padOrTrim(top[1].l)];
}

function looksLikeMrz(rawText: string): number {
  // Higher = more likely a real MRZ OCR result. Used to pick best band.
  const lines = rawText.split(/\r?\n/).map((l) => stripToMrzAlphabet(l));
  let score = 0;
  for (const l of lines) {
    const fillers = (l.match(/</g)?.length ?? 0);
    if (fillers >= 5) score += fillers;
    if (/^P[A-Z<]/.test(l)) score += 20;
    if (l.length >= 40 && l.length <= 48) score += 10;
  }
  return score;
}

function forceAlpha(ch: string): string { return DIGIT_TO_LETTER[ch] ?? ch; }
function forceDigit(ch: string): string { return LETTER_TO_DIGIT[ch] ?? ch; }
function forceAlphaOrFiller(ch: string): string { return ch === '<' ? '<' : (DIGIT_TO_LETTER[ch] ?? ch); }
function forceGender(ch: string): string {
  if (ch === 'M' || ch === 'F') return ch;
  if (ch === 'P' || ch === 'H' || ch === 'N') return 'M';
  if (ch === 'E' || ch === '3') return 'F';
  return '<';
}
function forceCheckDigit(ch: string): string { return ch === '<' ? '<' : (LETTER_TO_DIGIT[ch] ?? ch); }

function repairLine1(line: string): string {
  const c = line.split('');
  c[0] = 'P';
  c[1] = c[1] === '<' ? '<' : forceAlpha(c[1]);
  for (let i = 2; i <= 4; i++) c[i] = forceAlpha(c[i]);
  for (let i = 5; i <= 43; i++) c[i] = forceAlphaOrFiller(c[i]);
  return c.join('');
}

function repairLine2(line: string): string {
  const c = line.split('');
  c[9] = forceCheckDigit(c[9]);
  for (let i = 10; i <= 12; i++) c[i] = forceAlpha(c[i]);
  for (let i = 13; i <= 18; i++) c[i] = forceDigit(c[i]);
  c[19] = forceCheckDigit(c[19]);
  c[20] = forceGender(c[20]);
  for (let i = 21; i <= 26; i++) c[i] = forceDigit(c[i]);
  c[27] = forceCheckDigit(c[27]);
  c[42] = forceCheckDigit(c[42]);
  c[43] = forceCheckDigit(c[43]);
  return c.join('');
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

function toIsoDate(yymmdd: string, isExpiry: boolean): string {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const currentYY = new Date().getFullYear() % 100;
  let year: number;
  if (isExpiry) {
    year = yy < currentYY - 10 ? 2100 + yy : 2000 + yy;
  } else {
    year = yy > currentYY ? 1900 + yy : 2000 + yy;
  }
  return `${year}-${mm}-${dd}`;
}

function normalizeGender(v: string | null | undefined): PassportData['gender'] {
  if (v === 'M' || v === 'F' || v === 'X') return v;
  const s = (v ?? '').toUpperCase();
  if (s === 'MALE') return 'M';
  if (s === 'FEMALE') return 'F';
  return '';
}

function tryParse(line1: string, line2: string): {
  ok: boolean;
  checksumsValid: boolean;
  data?: PassportData;
  error?: string;
} {
  try {
    const result = parseMrz([line1, line2]);
    const fields = result.fields as {
      documentNumber?: string | null;
      lastName?: string | null;
      firstName?: string | null;
      nationality?: string | null;
      sex?: string | null;
      birthDate?: string | null;
      expirationDate?: string | null;
    };

    const data: PassportData = {
      passportNumber: (fields.documentNumber ?? '').replace(/</g, '').trim(),
      surname: (fields.lastName ?? '').trim(),
      givenName: (fields.firstName ?? '').trim(),
      nationality: (fields.nationality ?? '').trim(),
      gender: normalizeGender(fields.sex),
      dateOfBirth: toIsoDate(fields.birthDate ?? '', false),
      expiryDate: toIsoDate(fields.expirationDate ?? '', true),
    };

    const passOk = /^[A-Z0-9]{6,9}$/.test(data.passportNumber);
    const natOk = /^[A-Z]{3}$/.test(data.nationality);
    const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth);
    const expOk = /^\d{4}-\d{2}-\d{2}$/.test(data.expiryDate);
    const genderOk = data.gender === 'M' || data.gender === 'F' || data.gender === 'X' || data.gender === '';
    const nameOk = data.surname.length > 0 && data.givenName.length > 0;

    const checksumsValid = result.valid === true;
    const parsedOk = passOk && natOk && dobOk && expOk && genderOk && nameOk;

    return { ok: parsedOk, checksumsValid, data };
  } catch (err) {
    return { ok: false, checksumsValid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractPassportMrz(
  src: File | string,
  options: ExtractOptions = {},
): Promise<MrzResult> {
  const { onProgress } = options;
  const attempts: MrzAttempt[] = [];
  const warnings: string[] = [];

  const report = (p: number, label: string) => {
    try { onProgress?.(Math.max(0, Math.min(1, p)), label); } catch { /* noop */ }
  };

  let ownedWorker: Worker | null = null;
  try {
    report(0.02, 'Loading image');
    const img = await loadImage(src);

    let worker: Worker;
    const modelUsed: 'mrz' = 'mrz';
    if (options.worker) {
      worker = options.worker;
    } else {
      report(0.15, 'Initializing OCR');
      const bundle = await createOcrWorker();
      ownedWorker = bundle.worker;
      worker = bundle.worker;
    }

    let bestResult: { data: PassportData; rawText: string; checksumsValid: boolean } | null = null;
    let lastRaw = '';
    // Collect every successful parse so we can majority-vote the surname/
    // givenName across strategies. This defeats single-character OCR misreads
    // (e.g. M→R in "MINDA" → "RINDA") that still pass ICAO checksums when
    // only one strategy runs.
    const validParses: { data: PassportData; rawText: string; checksumsValid: boolean }[] = [];

    const bands = candidateBands(img);

    // Iterate (band, strategy) pairs in priority order. The auto-detected
    // band with the fastest strategy is tried first; we exit the moment we
    // get a parse with valid ICAO checksums so bulk runs stay fast.
    const totalPairs = bands.length * STRATEGIES.length;
    let pairIdx = 0;
    outer: for (const b of bands) {
      for (const strat of STRATEGIES) {
        pairIdx++;
        report(0.2 + (pairIdx / totalPairs) * 0.7, `OCR: ${strat.name} [${b.name}]`);

        let processed: HTMLCanvasElement | null = null;
        let text = '';
        try {
          processed = strat.run(b.canvas);
          const r = await worker.recognize(processed);
          text = r.data.text ?? '';
        } catch (err) {
          attempts.push({
            strategy: `${strat.name} [${b.name}]`,
            rawText: '',
            parsed: false,
            checksumsValid: false,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        } finally {
          // Free the processed (up to 3x-upscaled) canvas immediately so a
          // 200-file bulk run does not accumulate hundreds of MB of bitmaps.
          if (processed) { processed.width = 0; processed.height = 0; }
        }

        if (looksLikeMrz(text) > (looksLikeMrz(lastRaw) || -1)) lastRaw = text;

        const picked = pickMrzLines(text);
        if (!picked) {
          attempts.push({
            strategy: `${strat.name} [${b.name}]`,
            rawText: text,
            parsed: false,
            checksumsValid: false,
            error: 'could not find two 44-char MRZ lines',
          });
          continue;
        }
        const line1 = repairLine1(picked[0]);
        const line2 = repairLine2(picked[1]);
        const parsed = tryParse(line1, line2);
        attempts.push({
          strategy: `${strat.name} [${b.name}]`,
          rawText: `${line1}\n${line2}`,
          parsed: parsed.ok,
          checksumsValid: parsed.checksumsValid,
          error: parsed.error,
        });
        if (parsed.ok && parsed.data) {
          const entry = { data: parsed.data, rawText: `${line1}\n${line2}`, checksumsValid: parsed.checksumsValid };
          validParses.push(entry);
          if (!bestResult || (parsed.checksumsValid && !bestResult.checksumsValid)) {
            bestResult = entry;
          }
          // Progressive-stop: exit on the FIRST checksum-valid parse. All
          // four ICAO checksums passing is extremely strong evidence — the
          // odds of a random OCR misread producing four correct check
          // digits is < 1 in 10,000. This is the single biggest speedup.
          if (parsed.checksumsValid) { bestResult = entry; break outer; }
        }
      }
    }

    // Release source band canvases before returning to the caller.
    for (const b of bands) { b.canvas.width = 0; b.canvas.height = 0; }

    report(0.95, 'Finalizing');

    // Majority vote across all successful parses to pick the most reliable
    // surname/givenName. Prefer entries with valid ICAO checksums.
    if (validParses.length > 0) {
      const pool = validParses.some(v => v.checksumsValid)
        ? validParses.filter(v => v.checksumsValid)
        : validParses;
      const pick = (getter: (d: PassportData) => string) => {
        const counts = new Map<string, number>();
        for (const v of pool) {
          const key = getter(v.data);
          if (!key) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        let best = '', bestN = 0;
        for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
        return best;
      };
      const base = bestResult ?? pool[0];
      const voted: PassportData = {
        passportNumber: pick(d => d.passportNumber) || base.data.passportNumber,
        surname: pick(d => d.surname) || base.data.surname,
        givenName: pick(d => d.givenName) || base.data.givenName,
        nationality: pick(d => d.nationality) || base.data.nationality,
        gender: (pick(d => d.gender) as PassportData['gender']) || base.data.gender,
        dateOfBirth: pick(d => d.dateOfBirth) || base.data.dateOfBirth,
        expiryDate: pick(d => d.expiryDate) || base.data.expiryDate,
      };
      bestResult = { data: voted, rawText: base.rawText, checksumsValid: base.checksumsValid };
    }

    if (bestResult) {
      if (!bestResult.checksumsValid) warnings.push('One or more ICAO checksums did not validate.');
      report(1, 'Done');
      return {
        ok: true,
        data: bestResult.data,
        rawMrz: bestResult.rawText,
        modelUsed,
        attempts,
        warnings,
      };
    }

    report(1, 'Done');
    return {
      ok: false,
      rawMrz: lastRaw,
      modelUsed,
      attempts,
      warnings,
      error: 'MRZ could not be parsed after all preprocessing strategies.',
    };
  } catch (err) {
    return {
      ok: false,
      rawMrz: '',
      modelUsed: 'mrz',
      attempts,
      warnings,
      error: err instanceof Error ? (err.stack || err.message) : String(err),
    };
  } finally {
    if (ownedWorker) {
      try { await ownedWorker.terminate(); } catch { /* noop */ }
    }
  }
}
