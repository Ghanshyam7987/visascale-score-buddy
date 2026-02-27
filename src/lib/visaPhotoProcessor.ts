/**
 * Visa Photo Processor — ICAO-compliant biometric photo pipeline
 * 
 * Pipeline: BG removal (server) → Sharpen (Unsharp Mask) → Face detect → 
 *           Mathematical head-height crop → Iterative coverage correction
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
const TOP_MARGIN_PERCENT = 0.065; // 6.5% blank white above crown

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

/**
 * Compress image to max ~1.5MB before sending to edge function.
 * Prevents timeout from oversized payloads.
 */
async function compressForUpload(blob: Blob, maxSizeKB = 1500): Promise<Blob> {
  if (blob.size / 1024 <= maxSizeKB) return blob;

  const img = await loadImage(URL.createObjectURL(blob));
  const canvas = document.createElement('canvas');

  // Scale down if very large
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

  // Try decreasing quality
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
 * Client-side background removal fallback using skin/subject segmentation.
 * Scans for non-background pixels and replaces background with pure white.
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

  // Step 1: Build a foreground mask using edge detection + color similarity
  // Sample background color from corners
  const samplePoints = [
    0, // top-left
    (w - 1) * 4, // top-right
    ((h - 1) * w) * 4, // bottom-left
    ((h - 1) * w + w - 1) * 4, // bottom-right
  ];
  
  let bgR = 0, bgG = 0, bgB = 0;
  for (const idx of samplePoints) {
    bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2];
  }
  bgR /= 4; bgG /= 4; bgB /= 4;

  // Create binary mask: 0 = background, 1 = foreground
  const mask = new Uint8Array(w * h);
  const colorThreshold = 45; // color distance threshold

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dr = data[idx] - bgR;
      const dg = data[idx + 1] - bgG;
      const db = data[idx + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > colorThreshold) {
        mask[y * w + x] = 1;
      }
    }
  }

  // Step 2: Flood fill from edges to find connected background regions
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  // Seed from all 4 edges
  for (let x = 0; x < w; x++) {
    if (!mask[x]) queue.push(x); // top row
    if (!mask[(h - 1) * w + x]) queue.push((h - 1) * w + x); // bottom row
  }
  for (let y = 0; y < h; y++) {
    if (!mask[y * w]) queue.push(y * w); // left col
    if (!mask[y * w + w - 1]) queue.push(y * w + w - 1); // right col
  }

  // BFS flood fill
  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const x = pos % w;
    const y = Math.floor(pos / w);

    const neighbors = [];
    if (x > 0) neighbors.push(pos - 1);
    if (x < w - 1) neighbors.push(pos + 1);
    if (y > 0) neighbors.push(pos - w);
    if (y < h - 1) neighbors.push(pos + w);

    for (const n of neighbors) {
      if (!visited[n] && !mask[n]) {
        queue.push(n);
      }
    }
  }

  // Step 3: Replace background pixels with white
  for (let i = 0; i < w * h; i++) {
    if (visited[i]) {
      const idx = i * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  // Step 4: Soften edges (simple 1px feathering on boundary)
  const edgeData = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // If foreground pixel next to background
      if (!visited[i] && (visited[i-1] || visited[i+1] || visited[i-w] || visited[i+w])) {
        const idx = i * 4;
        edgeData[idx] = Math.round(data[idx] * 0.7 + 255 * 0.3);
        edgeData[idx+1] = Math.round(data[idx+1] * 0.7 + 255 * 0.3);
        edgeData[idx+2] = Math.round(data[idx+2] * 0.7 + 255 * 0.3);
      }
    }
  }

  ctx.putImageData(new ImageData(edgeData, w, h), 0, 0);
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

export function applySharpen(
  canvas: HTMLCanvasElement,
  strength: number = 50
): void {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Box blur for unsharp mask
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
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
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
    data[i]     = Math.min(255, Math.max(0, data[i]     + amount * (data[i]     - blurred[i])));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount * (data[i + 1] - blurred[i + 1])));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount * (data[i + 2] - blurred[i + 2])));
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
        // Native detector: forehead-to-chin typically.
        // Add ~18% above for crown/hair, ~5% below for chin margin
        const crownMargin = box.height * 0.18;
        const chinMargin = box.height * 0.05;
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
 * Skin-cluster head detection.
 * Finds top-of-head and bottom-of-chin by scanning non-white/non-background pixels
 * in the central region, then refines using skin color density.
 */
function detectHeadBySkinAnalysis(canvas: HTMLCanvasElement): HeadBox | null {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Step 1: Find subject extent by scanning non-white pixels in center 60%
  const xStart = Math.floor(w * 0.2);
  const xEnd = Math.floor(w * 0.8);

  // Find top and bottom of subject (non-white pixels)
  let subjectTop = h;
  let subjectBottom = 0;

  for (let y = 0; y < h; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r < 240 || g < 240 || b < 240) {
        if (y < subjectTop) subjectTop = y;
        if (y > subjectBottom) subjectBottom = y;
      }
    }
  }

  if (subjectTop >= subjectBottom) return null;

  // Step 2: Find skin pixels for face localization using YCbCr
  const skinRows = new Float32Array(h);
  const skinCols = new Float32Array(w);
  let totalSkin = 0;
  let weightedX = 0;

  for (let y = subjectTop; y <= Math.min(subjectBottom, Math.floor(h * 0.7)); y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // YCbCr skin detection
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

  // Step 3: Find the densest vertical band of skin = face region
  // Find top and bottom of skin cluster (face)
  let skinTop = h, skinBottom = 0;
  const skinThreshold = (xEnd - xStart) * 0.02; // at least 2% of scan width

  for (let y = subjectTop; y < h; y++) {
    if (skinRows[y] > skinThreshold) {
      if (y < skinTop) skinTop = y;
      if (y > skinBottom) skinBottom = y;
    }
  }

  if (skinTop >= skinBottom) return null;

  const skinFaceHeight = skinBottom - skinTop;

  // Step 4: Derive head box from skin measurements
  // Skin cluster top ≈ forehead. Crown is ~15-20% above that.
  // Skin cluster bottom ≈ neck area. Chin is ~10% above that.
  const crownY = Math.max(0, skinTop - skinFaceHeight * 0.18);
  const chinY = skinBottom - skinFaceHeight * 0.08;
  const headHeight = chinY - crownY;

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
    topOfHead: crownY,
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
 * Given:
 *   - Head_Height (pixels in source) = crown to chin
 *   - Face_Coverage (%) = user setting
 *   - Target dimensions (mm/cm → pixels at 300 DPI)
 * 
 * Calculate:
 *   Total_Photo_Height = Head_Height / (Face_Coverage / 100)
 *   Scale = Target_Photo_Height / Total_Photo_Height  (scale source to match)
 *   
 * Placement:
 *   - Top margin: ~6.5% of target height (white space above crown)
 *   - Head top placed at top_margin
 *   - Face centered horizontally
 *   - Shoulders/chest visible below chin
 */
function icaoCrop(
  sourceCanvas: HTMLCanvasElement,
  head: HeadBox,
  options: ProcessingOptions,
): HTMLCanvasElement {
  const targetW = dimensionToPixels(options.dimensions.width, options.dimensions.unit);
  const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);
  const coverageFraction = options.faceCoveragePercent / 100;

  // The head should occupy coverageFraction of the target photo height
  // So: headHeight_in_output = targetH * coverageFraction
  // Scale factor: scale * head.headHeight = targetH * coverageFraction
  const desiredHeadPx = targetH * coverageFraction;
  const scale = desiredHeadPx / head.headHeight;

  // Top margin: white space above the crown
  const topMargin = targetH * TOP_MARGIN_PERCENT;

  // In scaled source coordinates, where does the head start?
  const scaledHeadTop = head.topOfHead * scale;
  const scaledHeadCenterX = head.centerX * scale;

  // We want: in the output, the head's top appears at y = topMargin
  // So the source crop region starts at: sourceY such that scaledHeadTop - cropY = topMargin
  const cropY = scaledHeadTop - topMargin;

  // Center face horizontally
  const cropX = scaledHeadCenterX - targetW / 2;

  // Clamp to scaled source bounds
  const scaledW = sourceCanvas.width * scale;
  const scaledH = sourceCanvas.height * scale;

  const clampedCropX = Math.max(0, Math.min(scaledW - targetW, cropX));
  const clampedCropY = Math.max(0, Math.min(scaledH - targetH, cropY));

  // Draw
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d')!;

  // Fill with pure white first
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  // Draw the source region
  ctx.drawImage(
    sourceCanvas,
    clampedCropX / scale, clampedCropY / scale,  // source x, y
    targetW / scale, targetH / scale,              // source w, h
    0, 0,                                          // dest x, y
    targetW, targetH,                              // dest w, h
  );

  return out;
}

// ─── 5. Post-crop Head Measurement ──────────────────────────────────

/**
 * Measure the actual head/subject height in the output image.
 * Scans central 50% width for non-white pixels to find topmost and bottommost subject pixels.
 * 
 * For head-specific measurement, we look at the upper portion only (head, not shoulders).
 */
function measureHeadInOutput(canvas: HTMLCanvasElement): { topY: number; bottomY: number; heightPercent: number } {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const xStart = Math.floor(w * 0.25);
  const xEnd = Math.floor(w * 0.75);

  // Find topmost non-white pixel (crown of head)
  let topY = h;
  for (let y = 0; y < h && topY === h; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) {
        topY = y;
        break;
      }
    }
  }

  // Find chin: scan downward from top, find where skin-colored rows stop
  // and a gap or shoulder slope begins. Use row density of non-white center pixels.
  const rowDensity = new Float32Array(h);
  for (let y = topY; y < h; y++) {
    let count = 0;
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) {
        count++;
      }
    }
    rowDensity[y] = count / (xEnd - xStart);
  }

  // Head ends where the row width suddenly increases (shoulders) or has a "neck" narrowing.
  // Find the row with minimum density between topY and subject bottom = neck region
  let subjectBottom = 0;
  for (let y = h - 1; y >= topY; y--) {
    if (rowDensity[y] > 0.05) {
      subjectBottom = y;
      break;
    }
  }

  // Find neck = minimum density row between 40% and 75% of subject extent
  const subjectExtent = subjectBottom - topY;
  const neckSearchStart = topY + Math.floor(subjectExtent * 0.4);
  const neckSearchEnd = topY + Math.floor(subjectExtent * 0.75);

  let minDensity = 1;
  let neckY = neckSearchEnd;
  for (let y = neckSearchStart; y < neckSearchEnd; y++) {
    if (rowDensity[y] < minDensity && rowDensity[y] > 0) {
      minDensity = rowDensity[y];
      neckY = y;
    }
  }

  // Chin is slightly above neck minimum
  const chinY = neckY - Math.floor(subjectExtent * 0.02);
  const headHeight = chinY - topY;

  return {
    topY,
    bottomY: chinY,
    heightPercent: (headHeight / h) * 100,
  };
}

// ─── Full Pipeline ──────────────────────────────────────────────────

export async function processVisaPhoto(
  imageBlob: Blob,
  options: ProcessingOptions,
  onProgress?: (step: string, percent: number) => void
): Promise<ProcessingResult> {
  onProgress?.('Removing background...', 15);

  // Step A: Remove background (server-side)
  const processedImageUrl = await removeBackground(imageBlob);

  onProgress?.('Loading processed image...', 50);
  const img = await loadImage(processedImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  console.log(`[VisaPhoto] Source image: ${canvas.width}×${canvas.height}`);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Step B: Conservative sharpening (Unsharp Mask only)
  onProgress?.('Applying sharpening...', 60);
  applySharpen(canvas, options.sharpeningStrength);

  // Step C: Detect face/head
  onProgress?.('Detecting face...', 70);
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
      // Map coordinates from original to processed image
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
      sy = 0; // keep top of image
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

  const { head, method } = detection;
  console.log(`[VisaPhoto] Head detected (${method}): top=${head.topOfHead.toFixed(0)}, chin=${head.bottomOfChin.toFixed(0)}, height=${head.headHeight.toFixed(0)}, centerX=${head.centerX.toFixed(0)}`);

  // Step C: ICAO Crop with iterative correction
  onProgress?.('Cropping to ICAO standards...', 80);

  let result: HTMLCanvasElement = icaoCrop(canvas, head, options);
  let measurement = measureHeadInOutput(result);
  let achievedCoverage = measurement.heightPercent;
  let iterations = 1;

  console.log(`[VisaPhoto] Iteration 1: requested=${options.faceCoveragePercent}%, achieved=${achievedCoverage.toFixed(1)}%`);

  // Iterative correction loop
  for (let i = 1; i < MAX_ITERATIONS; i++) {
    const diff = options.faceCoveragePercent - achievedCoverage;
    if (Math.abs(diff) <= COVERAGE_TOLERANCE) break;

    // Adjust: create a corrected options object
    // If achieved is 65% but we wanted 70%, we need to scale up by 70/65
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
