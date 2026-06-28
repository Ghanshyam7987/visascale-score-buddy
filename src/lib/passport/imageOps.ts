// Canvas helpers — pure functions, safe to reuse from a Web Worker
// (via OffscreenCanvas) in the next phase.

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('image load failed'));
  });
  return img;
}

export async function renderToCanvas(src: string, rotationDeg = 0): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const rad = (rotationDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = Math.round(img.width * cos + img.height * sin);
  const h = Math.round(img.width * sin + img.height * cos);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas;
}

export function binarize(source: HTMLCanvasElement, threshold = 150): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const sctx = source.getContext('2d')!;
  const octx = out.getContext('2d')!;
  const img = sctx.getImageData(0, 0, source.width, source.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = (y - 128) * 1.6 + 128;
    const v = boosted < threshold ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Stronger preprocessing variant used as a fallback retry after a soft
 * MRZ-read failure: grayscale + heavier contrast + 2x upscale + adaptive
 * (windowed) threshold to handle low-contrast / hologram-laden scans.
 */
export function preprocessStrong(source: HTMLCanvasElement): HTMLCanvasElement {
  const scale = 2;
  const w = source.width * scale;
  const h = source.height * scale;
  const up = document.createElement('canvas');
  up.width = w;
  up.height = h;
  const uctx = up.getContext('2d')!;
  uctx.imageSmoothingEnabled = true;
  uctx.imageSmoothingQuality = 'high';
  uctx.drawImage(source, 0, 0, w, h);

  const img = uctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  // Adaptive threshold via mean over a sliding 15px window (row-only — cheap).
  const win = 15;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < win && x < w; x++) sum += gray[y * w + x];
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - Math.floor(win / 2));
      const x1 = Math.min(w - 1, x + Math.floor(win / 2));
      if (x > 0) {
        if (x + Math.floor(win / 2) < w) sum += gray[y * w + x + Math.floor(win / 2)];
        if (x - Math.floor(win / 2) - 1 >= 0) sum -= gray[y * w + x - Math.floor(win / 2) - 1];
      }
      const mean = sum / (x1 - x0 + 1);
      const v = gray[y * w + x] < mean - 8 ? 0 : 255;
      const k = (y * w + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = v;
      d[k + 3] = 255;
    }
  }
  uctx.putImageData(img, 0, 0);
  return up;
}

export function cropCanvas(
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

/** Rotate a canvas by a multiple of 90deg without resampling losses. */
export function rotateCanvas(src: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (deg === 0) return src;
  const out = document.createElement('canvas');
  if (deg === 180) {
    out.width = src.width;
    out.height = src.height;
  } else {
    out.width = src.height;
    out.height = src.width;
  }
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/**
 * Crop the MRZ band (bottom ~22% of the photo page) for a given orientation
 * already applied. Heuristic but ICAO compliant: MRZ is anchored to the
 * page's bottom edge.
 */
export function cropMrzBand(src: HTMLCanvasElement): HTMLCanvasElement {
  const bandH = Math.round(src.height * 0.22);
  const bandY = src.height - bandH;
  return cropCanvas(src, 0, bandY, src.width, bandH);
}

/**
 * Upscale a canvas by an integer factor with high-quality smoothing.
 * Tesseract is consistently more accurate on MRZ bands when the x-height
 * is closer to 30-40px, which on many phone scans means we need a 2x
 * blow-up before binarisation.
 */
export function upscale(src: HTMLCanvasElement, factor = 2): HTMLCanvasElement {
  if (factor <= 1) return src;
  const out = document.createElement('canvas');
  out.width = src.width * factor;
  out.height = src.height * factor;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/**
 * Score how "MRZ-like" an OCR text is: ratio of `<` filler characters,
 * presence of two long lines, and a leading "P" on the first line.
 */
export function mrzScore(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, '').toUpperCase())
    .filter((l) => l.length >= 30);
  if (lines.length < 2) return 0;
  const candidate = lines.slice(-2).join('');
  const fillers = (candidate.match(/</g) || []).length;
  const ratio = fillers / candidate.length;
  const startsP = /^P/.test(lines[lines.length - 2]) ? 0.2 : 0;
  return Math.min(1, ratio * 2.5 + startsP);
}

export function normalizeDate(raw: string): string {
  const m = raw.match(/(\d{2})[/\-.\s](\d{2})[/\-.\s](\d{2,4})/);
  if (!m) return '';
  let [, dd, mm, yy] = m;
  if (yy.length === 2) {
    const cy = new Date().getFullYear() % 100;
    yy = (parseInt(yy, 10) <= cy ? '20' : '19') + yy;
  }
  return `${dd}/${mm}/${yy}`;
}

const PLACE_RE = /^[A-Za-z\s,]+$/;
export function validPlace(value: string): string {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return '';
  if (!PLACE_RE.test(v)) return '';
  if (v.length < 2 || v.length > 60) return '';
  return v.toUpperCase();
}