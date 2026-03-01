/**
 * Visa Photo Processor — ICAO-compliant biometric photo pipeline
 * 
 * Pipeline: BG removal (server→client fallback) → Sharpen (Unsharp Mask) → 
 *           Face detect → Mathematical head-height crop → Iterative coverage correction
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

/**
 * HeadBox: crown (top of hair) to chin bottom.
 * This is the ICAO "head height" used for coverage math.
 */
export interface HeadBox {
  topOfHead: number;   // Y of crown/hair top
  bottomOfChin: number; // Y of chin bottom
  centerX: number;      // horizontal center of face
  headHeight: number;   // bottomOfChin - topOfHead
  faceWidth: number;    // width of face region
}

export interface ProcessingMetadata {
  requestedCoverage: number;
  achievedCoverage: number;
  detectionMethod: 'native' | 'fallback' | 'none';
  iterations: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProcessingResult {
  imageDataUrl: string;
  metadata: ProcessingMetadata;
}

// ─── Constants ────────────────────────────────────────────────────────

const DPI = 300;
const COVERAGE_TOLERANCE = 3; // ±3%
const MAX_ITERATIONS = 3;
const TOP_MARGIN_PERCENT = 0.07; // 7% blank white above crown (MANDATORY)

function dimensionToPixels(value: number, unit: 'cm' | 'mm'): number {
  const inches = unit === 'cm' ? value / 2.54 : value / 25.4;
  return Math.round(inches * DPI);
}

// ─── 1. Background Removal ───────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function compressForUpload(blob: Blob, maxSizeKB = 1500): Promise<Blob> {
  if (blob.size / 1024 <= maxSizeKB) return blob;

  const img = await loadImage(URL.createObjectURL(blob));
  const canvas = document.createElement('canvas');

  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const maxDim = 2400;
  if (w > maxDim || h > maxDim) {
    const ratio = maxDim / Math.max(w, h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

  let quality = 0.85;
  let result: Blob | null = null;
  while (quality >= 0.4) {
    result = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (result && result.size / 1024 <= maxSizeKB) break;
    quality -= 0.1;
  }
  return result || blob;
}

/**
 * Client-side background removal using adaptive flood-fill segmentation.
 * Samples background color from multiple edge points for accuracy.
 * Uses morphological operations to reduce halos and artifacts.
 */
async function removeBackgroundClientSide(imageBlob: Blob): Promise<string> {
  const img = await loadImage(URL.createObjectURL(imageBlob));
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Step 1: Sample background from multiple edge points (more robust)
  const edgeSamples: { r: number; g: number; b: number }[] = [];
  const samplePositions: [number, number][] = [];
  
  // Top edge
  for (let x = 0; x < w; x += Math.floor(w / 10)) {
    samplePositions.push([x, 0]);
    samplePositions.push([x, 1]);
  }
  // Bottom edge (sparse - may have shoulders)
  for (let x = 0; x < w; x += Math.floor(w / 5)) {
    samplePositions.push([x, h - 1]);
  }
  // Left/right edges
  for (let y = 0; y < h; y += Math.floor(h / 10)) {
    samplePositions.push([0, y]);
    samplePositions.push([w - 1, y]);
    samplePositions.push([1, y]);
    samplePositions.push([w - 2, y]);
  }

  for (const [x, y] of samplePositions) {
    const idx = (y * w + x) * 4;
    edgeSamples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  }

  // Use median of samples for more robust background color estimation
  edgeSamples.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
  const medIdx = Math.floor(edgeSamples.length / 2);
  const bgR = edgeSamples[medIdx].r;
  const bgG = edgeSamples[medIdx].g;
  const bgB = edgeSamples[medIdx].b;

  // Step 2: Create foreground mask with adaptive threshold
  const mask = new Uint8Array(w * h); // 0=bg, 1=foreground
  const baseThreshold = 35;
  
  // Also compute local variance for adaptive thresholding
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dr = data[idx] - bgR;
      const dg = data[idx + 1] - bgG;
      const db = data[idx + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      
      // Adaptive: be more aggressive near edges, more conservative in center
      const edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y);
      const edgeFactor = Math.min(1, edgeDist / (Math.min(w, h) * 0.15));
      const threshold = baseThreshold + (1 - edgeFactor) * 15;
      
      if (dist > threshold) {
        mask[y * w + x] = 1;
      }
    }
  }

  // Step 3: Morphological close (dilate then erode) to fill small gaps in foreground
  const tempMask = new Uint8Array(mask);
  // Dilate foreground
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) {
        tempMask[i] = 1;
      }
    }
  }
  // Erode back
  const closedMask = new Uint8Array(tempMask);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!(tempMask[i - 1] && tempMask[i + 1] && tempMask[i - w] && tempMask[i + w])) {
        closedMask[i] = 0;
      }
    }
  }

  // Step 4: Flood fill from edges to find connected background
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let x = 0; x < w; x++) {
    if (!closedMask[x]) queue.push(x);
    if (!closedMask[(h - 1) * w + x]) queue.push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    if (!closedMask[y * w]) queue.push(y * w);
    if (!closedMask[y * w + w - 1]) queue.push(y * w + w - 1);
  }

  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const x = pos % w;
    const y = Math.floor(pos / w);

    if (x > 0 && !visited[pos - 1] && !closedMask[pos - 1]) queue.push(pos - 1);
    if (x < w - 1 && !visited[pos + 1] && !closedMask[pos + 1]) queue.push(pos + 1);
    if (y > 0 && !visited[pos - w] && !closedMask[pos - w]) queue.push(pos - w);
    if (y < h - 1 && !visited[pos + w] && !closedMask[pos + w]) queue.push(pos + w);
  }

  // Step 5: Replace background with pure white
  for (let i = 0; i < w * h; i++) {
    if (visited[i]) {
      const idx = i * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  // Step 6: Edge feathering (1px max) — blend foreground edges with white
  const finalData = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!visited[i]) {
        // Check if this foreground pixel borders background
        const bgNeighbors =
          (visited[i - 1] ? 1 : 0) + (visited[i + 1] ? 1 : 0) +
          (visited[i - w] ? 1 : 0) + (visited[i + w] ? 1 : 0);
        if (bgNeighbors > 0) {
          const blend = bgNeighbors / 4 * 0.3; // max 30% blend toward white
          const idx = i * 4;
          finalData[idx] = Math.round(data[idx] * (1 - blend) + 255 * blend);
          finalData[idx + 1] = Math.round(data[idx + 1] * (1 - blend) + 255 * blend);
          finalData[idx + 2] = Math.round(data[idx + 2] * (1 - blend) + 255 * blend);
        }
      }
    }
  }

  ctx.putImageData(new ImageData(finalData, w, h), 0, 0);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export async function removeBackground(imageBlob: Blob): Promise<string> {
  // Try server-side first with 30s timeout
  try {
    const compressed = await compressForUpload(imageBlob);
    const base64 = await blobToBase64(compressed);

    const result = await Promise.race([
      supabase.functions.invoke('remove-background', {
        body: { imageBase64: base64 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 30000)
      ),
    ]);

    const { data, error } = result as any;
    if (!error && data?.processedImage) {
      return data.processedImage;
    }
    throw new Error(error?.message || 'No image returned');
  } catch (err) {
    console.warn('[VisaPhoto] Server BG removal failed, using client-side fallback:', err);
    return removeBackgroundClientSide(imageBlob);
  }
}

// ─── 2. Sharpening (Unsharp Mask — NO AI) ────────────────────────────

/**
 * Apply Unsharp Mask with ICAO-compliant parameters:
 *   Radius: 1.2px, Amount: 1.0, Threshold: 2
 * Preserves natural skin texture. No AI enhancement.
 */
export function applySharpen(
  canvas: HTMLCanvasElement,
  strength: number = 50
): void {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Gaussian-approximated blur with radius ~1.2px (using 3x3 weighted kernel)
  const blurred = new Float32Array(data.length);
  // Weights for approx radius 1.2: center=4, adjacent=2, diagonal=1 → total=16
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let r = 0, g = 0, b = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          const kw = kernel[ki++];
          r += data[idx] * kw;
          g += data[idx + 1] * kw;
          b += data[idx + 2] * kw;
        }
      }
      const idx = (y * w + x) * 4;
      blurred[idx] = r / kernelSum;
      blurred[idx + 1] = g / kernelSum;
      blurred[idx + 2] = b / kernelSum;
    }
  }

  // Unsharp Mask: amount=1.0 scaled by user strength, threshold=2
  const amount = (strength / 100) * 1.0;
  const threshold = 2;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const original = data[idx + c];
        const blur = blurred[idx + c];
        const diff = original - blur;
        // Only sharpen if difference exceeds threshold (preserves smooth skin)
        if (Math.abs(diff) > threshold) {
          data[idx + c] = Math.min(255, Math.max(0, Math.round(original + amount * diff)));
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ─── 3. Face / Head Detection ───────────────────────────────────────

interface DetectionResult {
  head: HeadBox;
  method: 'native' | 'fallback';
}

/**
 * Detect face and compute a HeadBox (crown-to-chin).
 * Pipeline: native FaceDetector → skin-cluster fallback.
 */
async function detectHead(canvas: HTMLCanvasElement): Promise<DetectionResult | null> {
  // Try native FaceDetector
  if ('FaceDetector' in window) {
    try {
      // @ts-ignore
      const detector = new window.FaceDetector({ maxDetectedFaces: 1 });
      const faces = await detector.detect(canvas);
      if (faces.length > 0) {
        const box = faces[0].boundingBox;
        // Native detector gives forehead-to-chin typically.
        // Add ~22% above for crown/hair (generous to avoid cutting hair)
        // Add ~5% below for chin/beard margin
        const crownMargin = box.height * 0.22;
        const chinMargin = box.height * 0.08;
        const topOfHead = Math.max(0, box.y - crownMargin);
        const bottomOfChin = Math.min(canvas.height, box.y + box.height + chinMargin);
        return {
          head: {
            topOfHead,
            bottomOfChin,
            centerX: box.x + box.width / 2,
            headHeight: bottomOfChin - topOfHead,
            faceWidth: box.width,
          },
          method: 'native',
        };
      }
    } catch {
      // fall through
    }
  }

  // Fallback: skin-cluster analysis
  const head = detectHeadBySkinAnalysis(canvas);
  if (head) return { head, method: 'fallback' };

  return null;
}

/**
 * Skin-cluster head detection using non-white pixel scanning + YCbCr skin analysis.
 * Finds absolute top of hair and bottom of chin.
 */
function detectHeadBySkinAnalysis(canvas: HTMLCanvasElement): HeadBox | null {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Scan central 60% width for subject pixels
  const xStart = Math.floor(w * 0.2);
  const xEnd = Math.floor(w * 0.8);

  // Find absolute top and bottom of subject (any non-white pixel = subject)
  let subjectTop = h;
  let subjectBottom = 0;

  for (let y = 0; y < h; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // Non-white threshold (catches hair, skin, clothing)
      if (r < 235 || g < 235 || b < 235) {
        if (y < subjectTop) subjectTop = y;
        if (y > subjectBottom) subjectBottom = y;
      }
    }
  }

  if (subjectTop >= subjectBottom) return null;

  // Find skin pixels for face localization using YCbCr
  const skinRows = new Float32Array(h);
  const skinCols = new Float32Array(w);
  let totalSkin = 0;
  let weightedX = 0;

  for (let y = subjectTop; y <= Math.min(subjectBottom, Math.floor(h * 0.7)); y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        skinRows[y]++;
        skinCols[x]++;
        totalSkin++;
        weightedX += x;
      }
    }
  }

  if (totalSkin < 100) return null;

  const faceCenterX = weightedX / totalSkin;

  // Find top and bottom of skin cluster
  let skinTop = h, skinBottom = 0;
  const skinThreshold = (xEnd - xStart) * 0.02;

  for (let y = subjectTop; y < h; y++) {
    if (skinRows[y] > skinThreshold) {
      if (y < skinTop) skinTop = y;
      if (y > skinBottom) skinBottom = y;
    }
  }

  if (skinTop >= skinBottom) return null;

  const skinFaceHeight = skinBottom - skinTop;

  // CRITICAL: Use absolute top of subject (hair) as topOfHead — NOT skin top
  // This prevents cutting hair in the crop
  const topOfHead = subjectTop;
  
  // Chin: bottom of skin cluster + small margin for beard
  const chinY = skinBottom + skinFaceHeight * 0.03;
  const headHeight = chinY - topOfHead;

  // Face width from skin columns
  let skinLeft = w, skinRight = 0;
  const colThreshold = skinFaceHeight * 0.03;
  for (let x = xStart; x < xEnd; x++) {
    if (skinCols[x] > colThreshold) {
      if (x < skinLeft) skinLeft = x;
      if (x > skinRight) skinRight = x;
    }
  }
  const faceWidth = skinRight - skinLeft;

  if (headHeight < 20 || faceWidth < 20) return null;

  return {
    topOfHead,
    bottomOfChin: chinY,
    centerX: faceCenterX,
    headHeight,
    faceWidth,
  };
}

// ─── 4. Mathematical ICAO Crop ──────────────────────────────────────

/**
 * CRITICAL CROP MATH:
 * 
 * Head_Height = absolute top of hair to bottom of chin
 * Total_Photo_Height = Head_Height / (FaceCoverage% / 100)
 * 
 * Placement:
 *   - Top margin: 7% of target height (MANDATORY white space above crown)
 *   - Head top placed at top_margin
 *   - Face centered horizontally
 *   - Shoulders/chest visible below chin
 *   - Do NOT crop hair, do NOT cut beard/chin
 */
function icaoCrop(
  sourceCanvas: HTMLCanvasElement,
  head: HeadBox,
  options: ProcessingOptions,
): HTMLCanvasElement {
  const targetW = dimensionToPixels(options.dimensions.width, options.dimensions.unit);
  const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);
  const coverageFraction = options.faceCoveragePercent / 100;

  // Head should occupy coverageFraction of target photo height
  const desiredHeadPx = targetH * coverageFraction;
  const scale = desiredHeadPx / head.headHeight;

  // 7% top margin (MANDATORY white space above crown)
  const topMargin = targetH * TOP_MARGIN_PERCENT;

  // In scaled source, where is the head top?
  const scaledHeadTop = head.topOfHead * scale;
  const scaledHeadCenterX = head.centerX * scale;

  // Position: head top at topMargin
  const cropY = scaledHeadTop - topMargin;
  const cropX = scaledHeadCenterX - targetW / 2;

  // Clamp
  const scaledW = sourceCanvas.width * scale;
  const scaledH = sourceCanvas.height * scale;
  const clampedCropX = Math.max(0, Math.min(scaledW - targetW, cropX));
  const clampedCropY = Math.max(0, Math.min(scaledH - targetH, cropY));

  // Draw
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d')!;

  // Fill with pure white first (ensures any uncovered area is white)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  ctx.drawImage(
    sourceCanvas,
    clampedCropX / scale, clampedCropY / scale,
    targetW / scale, targetH / scale,
    0, 0,
    targetW, targetH,
  );

  return out;
}

// ─── 5. Post-crop Head Measurement ──────────────────────────────────

/**
 * Measure head in output using the SAME method as detectHeadBySkinAnalysis:
 * - topY = absolute top of any non-white pixel in central 60% (hair/crown)
 * - chinY = bottom of skin cluster (YCbCr) + small margin
 * This ensures measurement is consistent with detection, so iterative correction converges.
 */
function measureHeadInOutput(canvas: HTMLCanvasElement): { topY: number; bottomY: number; heightPercent: number } {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const xStart = Math.floor(w * 0.2);
  const xEnd = Math.floor(w * 0.8);

  // 1. Find absolute top of subject (any non-white = hair/crown)
  let topY = h;
  for (let y = 0; y < h && topY === h; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx] < 235 || data[idx + 1] < 235 || data[idx + 2] < 235) {
        topY = y;
        break;
      }
    }
  }

  // 2. Find chin using skin detection (YCbCr) — same as detectHeadBySkinAnalysis
  const skinRows = new Float32Array(h);
  const skinThreshold = (xEnd - xStart) * 0.02;

  for (let y = topY; y < Math.min(h, topY + Math.floor((h - topY) * 0.85)); y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // Skip white pixels
      if (r > 240 && g > 240 && b > 240) continue;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        skinRows[y]++;
      }
    }
  }

  // Find bottom of skin cluster
  let skinBottom = 0;
  for (let y = h - 1; y >= topY; y--) {
    if (skinRows[y] > skinThreshold) {
      skinBottom = y;
      break;
    }
  }

  // If no skin found, fall back to non-white scanning for chin
  if (skinBottom <= topY) {
    // Use row density fallback
    for (let y = h - 1; y >= topY; y--) {
      let count = 0;
      for (let x = xStart; x < xEnd; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx] < 235 || data[idx + 1] < 235 || data[idx + 2] < 235) count++;
      }
      if (count / (xEnd - xStart) > 0.05) {
        // Find neck minimum above this to estimate chin
        skinBottom = y;
        break;
      }
    }
    // Estimate chin at ~55% of subject extent from top
    const subjectExtent = skinBottom - topY;
    const chinEstimate = topY + Math.floor(subjectExtent * 0.55);
    return { topY, bottomY: chinEstimate, heightPercent: ((chinEstimate - topY) / h) * 100 };
  }

  // Chin = bottom of skin + small margin for beard
  const skinFaceHeight = skinBottom - topY;
  const chinY = skinBottom + Math.floor(skinFaceHeight * 0.03);
  const headHeight = chinY - topY;

  return {
    topY,
    bottomY: chinY,
    heightPercent: (headHeight / h) * 100,
  };
}

// ─── White Enforcement ──────────────────────────────────────────────

/**
 * Force every non-person pixel to pure white (#FFFFFF).
 * Uses the same flood-fill background mask approach, then sets all background
 * pixels to exactly RGB(255,255,255,255).
 */
function enforceWhiteBackground(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Any pixel that's "near white" (from BG removal) → force pure white
  // Also catch grey patches and shadow remnants
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    // If pixel is light enough to be background remnant (not skin/hair/clothing)
    if (r > 220 && g > 220 && b > 220) {
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  // Second pass: flood fill from edges for any remaining non-white background
  const mask = new Uint8Array(w * h); // 1 = definitely foreground
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    if (data[idx] < 245 || data[idx + 1] < 245 || data[idx + 2] < 245) {
      mask[i] = 1;
    }
  }

  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  // Seed from edges
  for (let x = 0; x < w; x++) {
    if (!mask[x]) queue.push(x);
    if (!mask[(h - 1) * w + x]) queue.push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    if (!mask[y * w]) queue.push(y * w);
    if (!mask[y * w + w - 1]) queue.push(y * w + w - 1);
  }
  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;
    const x = pos % w, y = Math.floor(pos / w);
    if (x > 0 && !visited[pos - 1] && !mask[pos - 1]) queue.push(pos - 1);
    if (x < w - 1 && !visited[pos + 1] && !mask[pos + 1]) queue.push(pos + 1);
    if (y > 0 && !visited[pos - w] && !mask[pos - w]) queue.push(pos - w);
    if (y < h - 1 && !visited[pos + w] && !mask[pos + w]) queue.push(pos + w);
  }

  // Force all visited (background-connected) pixels to pure white
  for (let i = 0; i < w * h; i++) {
    if (visited[i]) {
      const idx = i * 4;
      data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255; data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ─── Full Pipeline ──────────────────────────────────────────────────

export async function processVisaPhoto(
  imageBlob: Blob,
  options: ProcessingOptions,
  onProgress?: (step: string, percent: number) => void
): Promise<ProcessingResult> {
  // Step A: Remove background
  onProgress?.('Removing background...', 15);
  const processedImageUrl = await removeBackground(imageBlob);

  onProgress?.('Loading processed image...', 40);
  const img = await loadImage(processedImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  console.log(`[VisaPhoto] Source image: ${canvas.width}×${canvas.height}`);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Step A.2: Enforce pure white on all background pixels
  onProgress?.('Enforcing white background...', 50);
  enforceWhiteBackground(canvas);

  // Step B: Detect face/head BEFORE sharpening (cleaner measurement)
  onProgress?.('Detecting face...', 60);
  let detection = await detectHead(canvas);

  // If detection fails on processed image, try original
  if (!detection) {
    console.log('[VisaPhoto] Detection failed on processed image, trying original...');
    const origImg = await loadImage(URL.createObjectURL(imageBlob));
    const origCanvas = document.createElement('canvas');
    origCanvas.width = origImg.naturalWidth;
    origCanvas.height = origImg.naturalHeight;
    origCanvas.getContext('2d')!.drawImage(origImg, 0, 0);

    const origDetection = await detectHead(origCanvas);
    if (origDetection) {
      const scaleX = canvas.width / origCanvas.width;
      const scaleY = canvas.height / origCanvas.height;
      detection = {
        head: {
          topOfHead: origDetection.head.topOfHead * scaleY,
          bottomOfChin: origDetection.head.bottomOfChin * scaleY,
          centerX: origDetection.head.centerX * scaleX,
          headHeight: origDetection.head.headHeight * scaleY,
          faceWidth: origDetection.head.faceWidth * scaleX,
        },
        method: origDetection.method,
      };
    }
  }

  // No face detected → center crop fallback
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
      sy = 0;
    }
    outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, targetW, targetH);
    // Apply sharpening on final output
    applySharpen(out, options.sharpeningStrength);

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

  const { head, method } = detection;
  console.log(`[VisaPhoto] Head detected (${method}): top=${head.topOfHead.toFixed(0)}, chin=${head.bottomOfChin.toFixed(0)}, height=${head.headHeight.toFixed(0)}, centerX=${head.centerX.toFixed(0)}`);

  // Step C: ICAO Crop with iterative correction
  onProgress?.('Cropping to ICAO standards...', 75);

  let result: HTMLCanvasElement = icaoCrop(canvas, head, options);
  let measurement = measureHeadInOutput(result);
  let achievedCoverage = measurement.heightPercent;
  let iterations = 1;

  console.log(`[VisaPhoto] Iteration 1: requested=${options.faceCoveragePercent}%, achieved=${achievedCoverage.toFixed(1)}%`);

  // Iterative correction loop
  for (let i = 1; i < MAX_ITERATIONS; i++) {
    const diff = options.faceCoveragePercent - achievedCoverage;
    if (Math.abs(diff) <= COVERAGE_TOLERANCE) break;

    const correctionFactor = options.faceCoveragePercent / achievedCoverage;
    const correctedOptions = {
      ...options,
      faceCoveragePercent: options.faceCoveragePercent * correctionFactor,
    };

    result = icaoCrop(canvas, head, correctedOptions);
    measurement = measureHeadInOutput(result);
    achievedCoverage = measurement.heightPercent;
    iterations = i + 1;

    console.log(`[VisaPhoto] Iteration ${iterations}: requested=${options.faceCoveragePercent}%, achieved=${achievedCoverage.toFixed(1)}%, correction=${correctionFactor.toFixed(3)}`);
  }

  // Step D: Apply mild sharpening AFTER crop (on final output only)
  onProgress?.('Applying sharpening...', 90);
  applySharpen(result, options.sharpeningStrength);

  // Final white enforcement on output
  enforceWhiteBackground(result);

  const confidence: ProcessingMetadata['confidence'] =
    method === 'native' ? 'high' :
      (Math.abs(options.faceCoveragePercent - achievedCoverage) <= COVERAGE_TOLERANCE ? 'medium' : 'low');

  onProgress?.('Done!', 100);

  return {
    imageDataUrl: result.toDataURL('image/jpeg', 0.95),
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
