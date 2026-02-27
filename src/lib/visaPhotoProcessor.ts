/**
 * Visa Photo Processor
 * Pipeline: BG removal (server) → Sharpen (client) → Face detect → Calibrated head-box → Iterative ICAO crop
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

/** Head box = crown-to-chin estimate derived from face detection */
export interface HeadBox {
  x: number;
  y: number;
  width: number;
  height: number; // crown to chin
}

export interface ProcessingMetadata {
  requestedCoverage: number;
  achievedCoverage: number;
  detectionMethod: 'native' | 'fallback' | 'none';
  iterations: number;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Constants ────────────────────────────────────────────────────────

const DPI = 300;
const COVERAGE_TOLERANCE = 3; // ±3%
const MAX_ITERATIONS = 3;

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
  
  return data.processedImage;
}

// ─── 2. Sharpening (Unsharp Mask) ────────────────────────────────────

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

interface DetectionResult {
  face: FaceBounds;
  method: 'native' | 'fallback';
}

export async function detectFaceWithMethod(canvas: HTMLCanvasElement): Promise<DetectionResult | null> {
  // Try native FaceDetector first
  if ('FaceDetector' in window) {
    try {
      // @ts-ignore
      const detector = new window.FaceDetector({ maxDetectedFaces: 1 });
      const faces = await detector.detect(canvas);
      if (faces.length > 0) {
        const box = faces[0].boundingBox;
        return {
          face: { x: box.x, y: box.y, width: box.width, height: box.height },
          method: 'native',
        };
      }
    } catch {
      // fallback below
    }
  }
  
  const fallback = detectFaceBySkinCluster(canvas);
  if (fallback) {
    return { face: fallback, method: 'fallback' };
  }
  return null;
}

/**
 * Improved skin-cluster based face detection.
 * Finds the largest connected cluster of skin-colored pixels in the upper 70% of the image,
 * then applies geometric constraints for a face-like bounding box.
 */
function detectFaceBySkinCluster(canvas: HTMLCanvasElement): FaceBounds | null {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Only scan upper 75% of image (face is typically in upper portion)
  const scanH = Math.floor(h * 0.75);
  
  // Build skin mask with column-based density
  const skinMask = new Uint8Array(w * scanH);
  const columnDensity = new Float32Array(w);
  const rowDensity = new Float32Array(scanH);
  
  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;

      // YCbCr skin detection
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        skinMask[y * w + x] = 1;
        columnDensity[x]++;
        rowDensity[y]++;
      }
    }
  }

  // Find the horizontal center of mass of skin pixels
  let totalSkin = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let x = 0; x < w; x++) {
    totalSkin += columnDensity[x];
    weightedX += columnDensity[x] * x;
  }
  for (let y = 0; y < scanH; y++) {
    weightedY += rowDensity[y] * y;
  }
  
  if (totalSkin < 100) return null;

  const centerX = weightedX / totalSkin;
  const centerY = weightedY / totalSkin;

  // Find skin bounding box around the center of mass (within reasonable range)
  const searchRadius = Math.min(w, h) * 0.4;
  let minX = w, minY = scanH, maxX = 0, maxY = 0;
  let clusterPixels = 0;

  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < w; x++) {
      if (!skinMask[y * w + x]) continue;
      
      // Only include pixels within reasonable distance from center of mass
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);
      if (dx > searchRadius || dy > searchRadius) continue;
      
      clusterPixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (clusterPixels < 50) return null;

  const skinWidth = maxX - minX;
  const skinHeight = maxY - minY;

  // Apply face geometry constraints:
  // Typical face aspect ratio is ~0.7-0.8 (width/height)
  // The skin region includes neck, so reduce height to ~65% for face only
  const faceHeight = skinHeight * 0.65;
  const faceWidth = Math.min(skinWidth * 0.85, faceHeight * 0.78);
  const faceCenterX = (minX + maxX) / 2;
  const faceTopY = minY + skinHeight * 0.05; // slight offset from very top

  return {
    x: faceCenterX - faceWidth / 2,
    y: faceTopY,
    width: faceWidth,
    height: faceHeight,
  };
}

// ─── 4. Calibrated Head Box ──────────────────────────────────────────

/**
 * Convert a raw face bounding box into a calibrated "head box" (crown-to-chin).
 * Native detectors typically return forehead-to-chin; we add crown margin.
 * Fallback detection may include neck; we trim it.
 * 
 * ICAO defines head height as crown (top of hair) to chin bottom.
 */
function calibrateHeadBox(face: FaceBounds, method: 'native' | 'fallback'): HeadBox {
  if (method === 'native') {
    // Native FaceDetector: usually forehead to chin
    // Add ~15% on top for crown/hair, keep bottom as-is
    const crownMargin = face.height * 0.15;
    return {
      x: face.x,
      y: face.y - crownMargin,
      width: face.width,
      height: face.height + crownMargin,
    };
  } else {
    // Fallback: our skin-cluster already trimmed, but add small crown margin
    const crownMargin = face.height * 0.12;
    return {
      x: face.x,
      y: face.y - crownMargin,
      width: face.width,
      height: face.height + crownMargin,
    };
  }
}

// ─── 5. Smart ICAO Crop ─────────────────────────────────────────────

function smartCropWithHead(
  canvas: HTMLCanvasElement,
  head: HeadBox,
  options: ProcessingOptions,
  scaleFactor?: number
): HTMLCanvasElement {
  const targetW = dimensionToPixels(options.dimensions.width, options.dimensions.unit);
  const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);

  const desiredHeadH = (options.faceCoveragePercent / 100) * targetH;
  const scale = scaleFactor ?? (desiredHeadH / head.height);

  const scaledW = canvas.width * scale;
  const scaledH = canvas.height * scale;

  const headCenterX = (head.x + head.width / 2) * scale;
  const headCenterY = (head.y + head.height / 2) * scale;

  // ICAO: head center should be at ~40-45% from top
  const headCenterYTarget = targetH * 0.42;

  let cropX = headCenterX - targetW / 2;
  let cropY = headCenterY - headCenterYTarget;

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

// ─── 6. Post-crop Coverage Measurement ──────────────────────────────

/**
 * After cropping, measure actual head height in the output by scanning for non-white pixels.
 * Returns the fraction of image height occupied by the subject (head).
 */
function measureAchievedCoverage(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Find topmost and bottommost non-white rows (subject pixels)
  // Consider center 60% of width to avoid edge artifacts
  const xStart = Math.floor(w * 0.2);
  const xEnd = Math.floor(w * 0.8);
  
  let topRow = h;
  let bottomRow = 0;
  
  for (let y = 0; y < h; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // Non-white pixel (threshold to handle JPEG compression artifacts)
      if (r < 245 || g < 245 || b < 245) {
        if (y < topRow) topRow = y;
        if (y > bottomRow) bottomRow = y;
      }
    }
  }

  if (topRow >= bottomRow) return 0;
  
  const subjectHeight = bottomRow - topRow;
  return (subjectHeight / h) * 100;
}

// ─── Full Pipeline ──────────────────────────────────────────────────

export interface ProcessingResult {
  imageDataUrl: string;
  metadata: ProcessingMetadata;
}

export async function processVisaPhoto(
  imageBlob: Blob,
  options: ProcessingOptions,
  onProgress?: (step: string, percent: number) => void
): Promise<ProcessingResult> {
  onProgress?.('Removing background...', 15);

  // Step 1: Remove background
  const processedImageUrl = await removeBackground(imageBlob);
  
  onProgress?.('Loading processed image...', 50);

  const img = await loadImage(processedImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  console.log(`[VisaPhoto] Loaded image: ${canvas.width}x${canvas.height}`);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  onProgress?.('Applying sharpening...', 65);

  // Step 2: Sharpen
  applySharpen(canvas, options.sharpeningStrength);

  onProgress?.('Detecting face & cropping...', 80);

  // Step 3: Detect face — try processed image first, then original
  let detection = await detectFaceWithMethod(canvas);
  
  if (!detection) {
    console.log('[VisaPhoto] Face not detected on processed image, trying original...');
    const origImg = await loadImage(URL.createObjectURL(imageBlob));
    const origCanvas = document.createElement('canvas');
    origCanvas.width = origImg.naturalWidth;
    origCanvas.height = origImg.naturalHeight;
    const origCtx = origCanvas.getContext('2d')!;
    origCtx.drawImage(origImg, 0, 0);
    
    const origDetection = await detectFaceWithMethod(origCanvas);
    if (origDetection) {
      const scaleX = canvas.width / origCanvas.width;
      const scaleY = canvas.height / origCanvas.height;
      detection = {
        face: {
          x: origDetection.face.x * scaleX,
          y: origDetection.face.y * scaleY,
          width: origDetection.face.width * scaleX,
          height: origDetection.face.height * scaleY,
        },
        method: origDetection.method,
      };
    }
  }

  // No face detected — center crop fallback
  if (!detection) {
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
    return {
      imageDataUrl: out.toDataURL('image/jpeg', 0.95),
      metadata: {
        requestedCoverage: options.faceCoveragePercent,
        achievedCoverage: 0,
        detectionMethod: 'none',
        iterations: 0,
        confidence: 'low',
      },
    };
  }

  const { face, method } = detection;
  console.log(`[VisaPhoto] Face detected (${method}): x=${face.x.toFixed(0)}, y=${face.y.toFixed(0)}, w=${face.width.toFixed(0)}, h=${face.height.toFixed(0)}`);

  // Step 4: Calibrate head box (crown-to-chin)
  const head = calibrateHeadBox(face, method);
  console.log(`[VisaPhoto] Head box: x=${head.x.toFixed(0)}, y=${head.y.toFixed(0)}, w=${head.width.toFixed(0)}, h=${head.height.toFixed(0)}`);

  // Step 5: Iterative crop with coverage correction
  const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);
  let desiredHeadH = (options.faceCoveragePercent / 100) * targetH;
  let currentScale = desiredHeadH / head.height;
  let result: HTMLCanvasElement;
  let achievedCoverage = 0;
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations = i + 1;
    result = smartCropWithHead(canvas, head, options, currentScale);
    achievedCoverage = measureAchievedCoverage(result!);
    
    console.log(`[VisaPhoto] Iteration ${iterations}: requested=${options.faceCoveragePercent}%, achieved=${achievedCoverage.toFixed(1)}%, scale=${currentScale.toFixed(4)}`);

    const diff = options.faceCoveragePercent - achievedCoverage;
    if (Math.abs(diff) <= COVERAGE_TOLERANCE) break;

    // Adjust scale: if achieved is too small, zoom in more; if too big, zoom out
    // Use proportional correction
    const correction = diff / achievedCoverage;
    currentScale *= (1 + correction * 0.6); // damped correction to avoid overshoot
  }

  const confidence: ProcessingMetadata['confidence'] = 
    method === 'native' ? 'high' : 
    (Math.abs(options.faceCoveragePercent - achievedCoverage) <= COVERAGE_TOLERANCE ? 'medium' : 'low');

  onProgress?.('Done!', 100);
  
  return {
    imageDataUrl: result!.toDataURL('image/jpeg', 0.95),
    metadata: {
      requestedCoverage: options.faceCoveragePercent,
      achievedCoverage: Math.round(achievedCoverage),
      detectionMethod: method,
      iterations,
      confidence,
    },
  };
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
