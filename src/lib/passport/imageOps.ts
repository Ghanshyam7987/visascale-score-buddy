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