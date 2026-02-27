/**
 * Visa Photo Processor
 * Image processing pipeline:
 * 1. Background removal via server-side AI (solid white)
 * 2. Traditional sharpening (unsharp mask) - client-side
 * 3. Face detection & ICAO-compliant smart crop - client-side
 * 
 * NO generative AI on face — preserves biometric reality.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────

export interface PhotoDimensions {
  width: number;
  height: number;
  unit: 'cm' | 'mm';
}

export interface ProcessingOptions {
  dimensions: PhotoDimensions;
  faceCoveragePercent: number;
  sharpeningStrength: number;
}

export interface FaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Constants ────────────────────────────────────────────────────────

const DPI = 300;

function dimensionToPixels(value: number, unit: 'cm' | 'mm'): number {
  const inches = unit === 'cm' ? value / 2.54 : value / 25.4;
  return Math.round(inches * DPI);
}

// ─── 1. Background Removal (Server-side) ─────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function removeBackground(imageBlob: Blob): Promise<string> {
  const base64 = await blobToBase64(imageBlob);
  
  const { data, error } = await supabase.functions.invoke('remove-background', {
    body: { imageBase64: base64 },
  });

  if (error) throw new Error(`Background removal failed: ${error.message}`);
  if (!data?.processedImage) throw new Error('No processed image returned');
  
  return data.processedImage; // returns data:image/... URL
}

// ─── 2. Traditional Sharpening (Unsharp Mask) ────────────────────────

export function applySharpen(
  canvas: HTMLCanvasElement,
  strength: number = 50
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const blurred = new Float32Array(data.length);
  const radius = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          const idx = (ny * w + nx) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }
      const idx = (y * w + x) * 4;
      blurred[idx] = r / count;
      blurred[idx + 1] = g / count;
      blurred[idx + 2] = b / count;
    }
  }

  const amount = (strength / 100) * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + amount * (data[i] - blurred[i])));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount * (data[i + 1] - blurred[i + 1])));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount * (data[i + 2] - blurred[i + 2])));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ─── 3. Face Detection ──────────────────────────────────────────────

export async function detectFace(canvas: HTMLCanvasElement): Promise<FaceBounds | null> {
  if ('FaceDetector' in window) {
    try {
      // @ts-ignore
      const detector = new window.FaceDetector({ maxDetectedFaces: 1 });
      const faces = await detector.detect(canvas);
      if (faces.length > 0) {
        const box = faces[0].boundingBox;
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }
    } catch {
      // fallback below
    }
  }
  return detectFaceBySkinColor(canvas);
}

function detectFaceBySkinColor(canvas: HTMLCanvasElement): FaceBounds | null {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let skinPixels = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        skinPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (skinPixels < 100) return null;

  const skinWidth = maxX - minX;
  const skinHeight = maxY - minY;
  const faceHeight = skinHeight * 0.6;
  const faceWidth = Math.min(skinWidth, faceHeight * 0.75);
  const faceCenterX = minX + skinWidth / 2;

  return {
    x: faceCenterX - faceWidth / 2,
    y: minY,
    width: faceWidth,
    height: faceHeight,
  };
}

// ─── 4. Smart ICAO Crop ─────────────────────────────────────────────

export function smartCrop(
  canvas: HTMLCanvasElement,
  face: FaceBounds,
  options: ProcessingOptions
): HTMLCanvasElement {
  const targetW = dimensionToPixels(options.dimensions.width, options.dimensions.unit);
  const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);

  const desiredFaceH = (options.faceCoveragePercent / 100) * targetH;
  const scale = desiredFaceH / face.height;

  const scaledW = canvas.width * scale;
  const scaledH = canvas.height * scale;

  const faceCenterX = (face.x + face.width / 2) * scale;
  const faceCenterY = (face.y + face.height / 2) * scale;

  const headCenterYTarget = targetH * 0.45;

  let cropX = faceCenterX - targetW / 2;
  let cropY = faceCenterY - headCenterYTarget;

  cropX = Math.max(0, Math.min(scaledW - targetW, cropX));
  cropY = Math.max(0, Math.min(scaledH - targetH, cropY));

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  ctx.drawImage(
    canvas,
    cropX / scale, cropY / scale, targetW / scale, targetH / scale,
    0, 0, targetW, targetH
  );

  return out;
}

// ─── Full Pipeline ──────────────────────────────────────────────────

export async function processVisaPhoto(
  imageBlob: Blob,
  options: ProcessingOptions,
  onProgress?: (step: string, percent: number) => void
): Promise<string> {
  onProgress?.('Removing background...', 15);

  // Step 1: Remove background (server-side)
  const processedImageUrl = await removeBackground(imageBlob);
  
  onProgress?.('Loading processed image...', 50);

  // Load the result into a canvas
  const img = await loadImage(processedImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  onProgress?.('Applying sharpening...', 65);

  // Step 2: Sharpen (client-side, traditional)
  applySharpen(canvas, options.sharpeningStrength);

  onProgress?.('Detecting face & cropping...', 80);

  // Step 3: Detect face
  const face = await detectFace(canvas);

  if (!face) {
    onProgress?.('Face not detected, using center crop...', 85);
    const targetW = dimensionToPixels(options.dimensions.width, options.dimensions.unit);
    const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);
    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const outCtx = out.getContext('2d')!;
    outCtx.fillStyle = '#FFFFFF';
    outCtx.fillRect(0, 0, targetW, targetH);

    const srcAspect = canvas.width / canvas.height;
    const tgtAspect = targetW / targetH;
    let sw = canvas.width, sh = canvas.height, sx = 0, sy = 0;
    if (srcAspect > tgtAspect) {
      sw = canvas.height * tgtAspect;
      sx = (canvas.width - sw) / 2;
    } else {
      sh = canvas.width / tgtAspect;
      sy = (canvas.height - sh) / 2;
    }
    outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

    onProgress?.('Done!', 100);
    return out.toDataURL('image/jpeg', 0.95);
  }

  // Step 4: Smart ICAO crop
  const result = smartCrop(canvas, face, options);

  onProgress?.('Done!', 100);
  return result.toDataURL('image/jpeg', 0.95);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
