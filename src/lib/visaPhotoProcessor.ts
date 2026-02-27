/**
 * Visa Photo Processor
 * Client-side image processing pipeline:
 * 1. Background removal (solid white)
 * 2. Traditional sharpening (unsharp mask)
 * 3. Face detection & ICAO-compliant smart crop
 * 
 * NO generative AI — preserves biometric reality.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface PhotoDimensions {
  width: number;
  height: number;
  unit: 'cm' | 'mm';
}

export interface ProcessingOptions {
  dimensions: PhotoDimensions;
  faceCoveragePercent: number; // e.g. 70 means face should be 70% of photo height
  sharpeningStrength: number; // 0-100
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

// ─── 1. Background Removal ───────────────────────────────────────────

export async function removeBackground(imageBlob: Blob): Promise<Blob> {
  const { removeBackground: removeBg } = await import('@imgly/background-removal');
  
  const result = await removeBg(imageBlob, {
    output: { format: 'image/png', quality: 1 },
  });
  
  return result;
}

export function compositeOnWhite(
  foregroundCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = foregroundCanvas.width;
  out.height = foregroundCanvas.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(foregroundCanvas, 0, 0);
  return out;
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

  // Create blurred copy using simple box blur
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

  // Unsharp mask: original + amount * (original - blurred)
  const amount = (strength / 100) * 1.5; // max 1.5x
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + amount * (data[i] - blurred[i])));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount * (data[i + 1] - blurred[i + 1])));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount * (data[i + 2] - blurred[i + 2])));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ─── 3. Face Detection ──────────────────────────────────────────────

/**
 * Attempts to use browser's FaceDetector API.
 * Falls back to skin-color heuristic if unavailable.
 */
export async function detectFace(canvas: HTMLCanvasElement): Promise<FaceBounds | null> {
  // Try native FaceDetector API (Chrome/Edge)
  if ('FaceDetector' in window) {
    try {
      // @ts-ignore - FaceDetector is experimental
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

  // Fallback: skin-color region detection
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

  // Scan for skin-colored pixels (simple YCbCr-based detection)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      
      if (a < 128) continue; // skip transparent

      // Convert to YCbCr
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

  // The face is roughly in the upper portion of skin region
  const skinWidth = maxX - minX;
  const skinHeight = maxY - minY;

  // Estimate face as upper 60% of skin area, centered
  const faceHeight = skinHeight * 0.6;
  const faceWidth = Math.min(skinWidth, faceHeight * 0.75); // face aspect ~3:4
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
  const targetAspect = targetW / targetH;

  // Face coverage: face height should be X% of final photo height
  const desiredFaceH = (options.faceCoveragePercent / 100) * targetH;
  const scale = desiredFaceH / face.height;

  // Scaled source dimensions
  const scaledW = canvas.width * scale;
  const scaledH = canvas.height * scale;

  // Face center in scaled coordinates
  const faceCenterX = (face.x + face.width / 2) * scale;
  const faceCenterY = (face.y + face.height / 2) * scale;

  // ICAO: head center should be at ~45% from top
  const headCenterYTarget = targetH * 0.45;

  // Calculate crop origin
  let cropX = faceCenterX - targetW / 2;
  let cropY = faceCenterY - headCenterYTarget;

  // Clamp to bounds
  cropX = Math.max(0, Math.min(scaledW - targetW, cropX));
  cropY = Math.max(0, Math.min(scaledH - targetH, cropY));

  // Create output canvas
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d')!;
  
  // Fill white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  // Draw scaled & cropped image
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
  onProgress?.('Removing background...', 10);

  // Step 1: Remove background
  const fgBlob = await removeBackground(imageBlob);
  
  onProgress?.('Compositing on white background...', 40);

  // Load into canvas
  const img = await blobToImage(fgBlob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Composite on white
  const whiteCanvas = compositeOnWhite(canvas);

  onProgress?.('Applying sharpening...', 60);

  // Step 2: Sharpen
  applySharpen(whiteCanvas, options.sharpeningStrength);

  onProgress?.('Detecting face & cropping...', 75);

  // Step 3: Detect face
  const face = await detectFace(whiteCanvas);

  if (!face) {
    // Fallback: center crop without face detection
    onProgress?.('Face not detected, using center crop...', 80);
    const targetW = dimensionToPixels(options.dimensions.width, options.dimensions.unit);
    const targetH = dimensionToPixels(options.dimensions.height, options.dimensions.unit);
    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const outCtx = out.getContext('2d')!;
    outCtx.fillStyle = '#FFFFFF';
    outCtx.fillRect(0, 0, targetW, targetH);

    const srcAspect = whiteCanvas.width / whiteCanvas.height;
    const tgtAspect = targetW / targetH;
    let sw = whiteCanvas.width, sh = whiteCanvas.height, sx = 0, sy = 0;
    if (srcAspect > tgtAspect) {
      sw = whiteCanvas.height * tgtAspect;
      sx = (whiteCanvas.width - sw) / 2;
    } else {
      sh = whiteCanvas.width / tgtAspect;
      sy = (whiteCanvas.height - sh) / 2;
    }
    outCtx.drawImage(whiteCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

    onProgress?.('Done!', 100);
    return out.toDataURL('image/jpeg', 0.95);
  }

  // Step 4: Smart ICAO crop
  const result = smartCrop(whiteCanvas, face, options);

  onProgress?.('Done!', 100);
  return result.toDataURL('image/jpeg', 0.95);
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
