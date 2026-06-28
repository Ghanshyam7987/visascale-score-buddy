// Image preprocessing for the MRZ extraction service.
// Pure helpers; no UI, no React. Designed to be safe inside a Web Worker
// (OffscreenCanvas) in a later phase.

import {
  binarize,
  cropCanvas,
  preprocessStrong,
  renderToCanvas,
  rotateCanvas,
  upscale,
} from '@/lib/passport/imageOps';

export { renderToCanvas, rotateCanvas, binarize, preprocessStrong, cropCanvas, upscale };

/**
 * Crop a band anchored to the bottom of the page covering `fraction` of
 * the height. ICAO TD3 MRZ is anchored to the bottom edge of the photo
 * page. Trying several fractions lets us tolerate scans that include or
 * omit page margin.
 */
export function cropMrzBandAt(src: HTMLCanvasElement, fraction: number): HTMLCanvasElement {
  const f = Math.max(0.1, Math.min(0.5, fraction));
  const bandH = Math.round(src.height * f);
  const bandY = src.height - bandH;
  return cropCanvas(src, 0, bandY, src.width, bandH);
}

/**
 * Split an MRZ band into its top (Line 1) and bottom (Line 2) halves.
 * ICAO TD3 prints both lines at identical heights, so a strict 50/50
 * split is correct once the band itself is cropped tightly.
 */
export function splitMrzHalves(
  band: HTMLCanvasElement,
): [HTMLCanvasElement, HTMLCanvasElement] {
  const halfH = Math.floor(band.height / 2);
  const top = cropCanvas(band, 0, 0, band.width, halfH);
  const bottom = cropCanvas(band, 0, halfH, band.width, band.height - halfH);
  return [top, bottom];
}

/**
 * Stretch a canvas horizontally by `factor` with high-quality smoothing.
 * Used on the Line-1 half before OCR: increasing the horizontal
 * resolution gives the OCR-B classifier substantially more pixels per
 * `<` chevron, which prevents it from collapsing the diagonal strokes
 * into a vertical-stem letter (K / C / L / I).
 */
export function stretchHorizontal(
  src: HTMLCanvasElement,
  factor = 1.4,
): HTMLCanvasElement {
  if (factor <= 1) return src;
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * factor);
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}