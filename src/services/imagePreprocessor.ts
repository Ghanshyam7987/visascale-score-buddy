// Image preprocessing for the MRZ extraction service.
// Pure helpers; no UI, no React. Designed to be safe inside a Web Worker
// (OffscreenCanvas) in a later phase.

import {
  binarize,
  cropCanvas,
  preprocessStrong,
  renderToCanvas,
  rotateCanvas,
} from '@/lib/passport/imageOps';

export { renderToCanvas, rotateCanvas, binarize, preprocessStrong, cropCanvas };

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