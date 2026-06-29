import { useState, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, X, ScanFace, FileImage, Loader2 } from 'lucide-react';
import Tesseract from 'tesseract.js';
import mrzTrainedDataAsset from '@/assets/mrz.traineddata.asset.json';

// MRZ / OCR-B trained model bundled with the project and served from our
// asset CDN. The traineddata is shipped uncompressed (no .gz), so Tesseract.js
// is told to skip gzip decoding via `gzip: false`.
const MRZ_TRAINEDDATA_URL = mrzTrainedDataAsset.url;
const MRZ_LANG_PATH = MRZ_TRAINEDDATA_URL.replace(/\/mrz\.traineddata$/, '');

type MrzModelLoadFailure = {
  url: string;
  httpStatus: string;
  networkError: string;
  corsError: string;
  reason: string;
  stack: string;
};

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const getErrorStack = (err: unknown) =>
  err instanceof Error ? (err.stack || err.message) : String(err);

async function probeMrzModelUrl(): Promise<Pick<MrzModelLoadFailure, 'httpStatus' | 'networkError' | 'corsError'>> {
  try {
    const response = await fetch(MRZ_TRAINEDDATA_URL, { method: 'HEAD', cache: 'no-store' });
    return {
      httpStatus: `${response.status} ${response.statusText}`.trim(),
      networkError: 'none',
      corsError: 'none',
    };
  } catch (err) {
    const message = getErrorMessage(err);
    return {
      httpStatus: 'unavailable',
      networkError: message,
      corsError: err instanceof TypeError ? message : 'none',
    };
  }
}

async function recognizeMrz(
  input: string,
  onProgress: (p: number) => void,
): Promise<{ text: string; modelUsed: 'mrz' | 'eng'; modelLoadFailure: MrzModelLoadFailure | null }> {
  const baseOptions = {
    tessedit_pageseg_mode: '6',
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
  } as Record<string, unknown>;

  const logger = (m: { status?: string; progress?: number }) => {
    if (m.status === 'recognizing text' && typeof m.progress === 'number') {
      onProgress(m.progress);
    }
  };

  // Try the MRZ / OCR-B model first.
  let modelLoadFailure: MrzModelLoadFailure | null = null;
  try {
    // Verify the traineddata is reachable (HTTP 200) before handing off to
    // Tesseract.js — otherwise the worker silently falls back / hangs.
    const probe = await probeMrzModelUrl();
    if (!probe.httpStatus.startsWith('200')) {
      throw new Error(
        `MRZ traineddata not reachable (HTTP ${probe.httpStatus}, network: ${probe.networkError}, cors: ${probe.corsError})`,
      );
    }
    const r = await Tesseract.recognize(input, 'mrz', {
      logger,
      errorHandler: (err: unknown) => {
        console.error('MRZ traineddata worker error:', err);
      },
      langPath: MRZ_LANG_PATH,
      gzip: false,
      ...baseOptions,
    } as never);
    return { text: r.data.text ?? '', modelUsed: 'mrz', modelLoadFailure: null };
  } catch (err) {
    const probe = await probeMrzModelUrl();
    modelLoadFailure = {
      url: MRZ_TRAINEDDATA_URL,
      httpStatus: probe.httpStatus,
      networkError: probe.networkError,
      corsError: probe.corsError,
      reason: getErrorMessage(err),
      stack: getErrorStack(err),
    };
    console.warn('MRZ traineddata unavailable, falling back to eng:', err);
    console.error('MRZ model load failed diagnostics:', modelLoadFailure);
    console.error('MRZ model requested URL:', modelLoadFailure.url);
    console.error('MRZ model HTTP status:', modelLoadFailure.httpStatus);
    console.error('MRZ model network error:', modelLoadFailure.networkError);
    console.error('MRZ model CORS error:', modelLoadFailure.corsError);
    console.error('MRZ model exception stack:', modelLoadFailure.stack);
  }

  // Fallback to default English model.
  const r = await Tesseract.recognize(input, 'eng', {
    logger,
    ...baseOptions,
  } as never);
  return { text: r.data.text ?? '', modelUsed: 'eng', modelLoadFailure };
}

// Preprocess the bottom 25% of the passport image (MRZ band):
// grayscale -> contrast boost -> adaptive threshold -> 2x upscale.
// Returns a data URL ready for OCR.
async function buildMrzCrop(srcUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = srcUrl;
  });

  const cropH = Math.max(1, Math.round(img.naturalHeight * 0.25));
  const cropY = img.naturalHeight - cropH;
  const cropW = img.naturalWidth;

  // Initial crop canvas
  const base = document.createElement('canvas');
  base.width = cropW;
  base.height = cropH;
  const bctx = base.getContext('2d')!;
  bctx.drawImage(img, 0, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const imgData = bctx.getImageData(0, 0, cropW, cropH);
  const data = imgData.data;

  // Grayscale + contrast boost (around mid 128)
  const contrast = 1.6;
  const gray = new Uint8ClampedArray(cropW * cropH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let v = (g - 128) * contrast + 128;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    gray[p] = v;
  }

  // Adaptive threshold (mean of local window)
  const win = Math.max(15, Math.round(cropH / 12) | 1); // odd-ish window
  const half = Math.floor(win / 2);
  const C = 10;

  // Build integral image for fast local mean
  const integral = new Float64Array((cropW + 1) * (cropH + 1));
  for (let y = 0; y < cropH; y++) {
    let rowSum = 0;
    for (let x = 0; x < cropW; x++) {
      rowSum += gray[y * cropW + x];
      integral[(y + 1) * (cropW + 1) + (x + 1)] =
        integral[y * (cropW + 1) + (x + 1)] + rowSum;
    }
  }

  for (let y = 0; y < cropH; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(cropH - 1, y + half);
    for (let x = 0; x < cropW; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(cropW - 1, x + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (cropW + 1) + (x2 + 1)] -
        integral[(y1) * (cropW + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (cropW + 1) + (x1)] +
        integral[y1 * (cropW + 1) + x1];
      const mean = sum / area;
      const idx = (y * cropW + x) * 4;
      const v = gray[y * cropW + x] < mean - C ? 0 : 255;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  bctx.putImageData(imgData, 0, 0);

  // 2x upscale
  const up = document.createElement('canvas');
  up.width = cropW * 2;
  up.height = cropH * 2;
  const uctx = up.getContext('2d')!;
  uctx.imageSmoothingEnabled = false;
  uctx.drawImage(base, 0, 0, up.width, up.height);

  return up.toDataURL('image/png');
}

const PassportExtractor = () => {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [mrzText, setMrzText] = useState<string | null>(null);
  const [mrzModel, setMrzModel] = useState<'mrz' | 'eng' | null>(null);
  const [mrzModelLoadFailure, setMrzModelLoadFailure] = useState<MrzModelLoadFailure | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);
  const [mrzError, setMrzError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const objectUrl = URL.createObjectURL(f);
    setImage(objectUrl);
    setFileName(f.name);
    setFile(f);
    setOcrText(null);
    setMrzText(null);
    setMrzModel(null);
    setMrzModelLoadFailure(null);
    setFullError(null);
    setMrzError(null);
    setError(null);
    setProgress(0);
  }, []);

  const handleUploadClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleRemove = useCallback(() => {
    if (image) {
      URL.revokeObjectURL(image);
    }
    setImage(null);
    setFileName(null);
    setFile(null);
    setOcrText(null);
    setMrzText(null);
    setMrzModel(null);
    setMrzModelLoadFailure(null);
    setFullError(null);
    setMrzError(null);
    setError(null);
    setProgress(0);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [image]);

  const handleExtract = useCallback(async () => {
    if (!file || !image) return;
    setIsProcessing(true);
    setError(null);
    setOcrText(null);
    setMrzText(null);
    setMrzModel(null);
    setMrzModelLoadFailure(null);
    setFullError(null);
    setMrzError(null);
    setProgress(0);

    // Pass 1: full-page OCR (raw) — isolated
    try {
      const fullResult = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(Math.round(m.progress * 50));
          }
        },
      });
      setOcrText(fullResult.data.text ?? '');
    } catch (err) {
      console.error('Full Page OCR failed:', err);
      const msg = err instanceof Error ? (err.stack || err.message) : String(err);
      setFullError(msg);
    }

    // Pass 2: cropped MRZ OCR — isolated, must not stop execution
    try {
      const mrzDataUrl = await buildMrzCrop(image);
      const mrzResult = await recognizeMrz(mrzDataUrl, (p) => {
        setProgress(50 + Math.round(p * 50));
      });
      setMrzText(mrzResult.text);
      setMrzModel(mrzResult.modelUsed);
      setMrzModelLoadFailure(mrzResult.modelLoadFailure);
    } catch (err) {
      console.error('MRZ OCR failed:', err);
      const msg = err instanceof Error ? (err.stack || err.message) : String(err);
      setMrzError(msg);
    }

    setIsProcessing(false);
  }, [file, image]);

  return (
    <AppLayout>
      <Header title="Passport Extractor" />

      <div className="p-4 space-y-6">
        {/* Intro */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Passport Extractor</h2>
          <p className="text-sm text-muted-foreground">
            Upload a passport image to get started. OCR will be connected in a future phase.
          </p>
        </div>

        {/* Upload Area */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {!image ? (
                <button
                  onClick={handleUploadClick}
                  className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="p-3 rounded-full bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Upload passport image</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or JPEG</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-border bg-muted aspect-[4/3]">
                    <img
                      src={image}
                      alt="Selected passport preview"
                      className="w-full h-full object-contain"
                    />
                    <button
                      onClick={handleRemove}
                      className="absolute top-2 right-2 p-2 rounded-full bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 transition-colors"
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {fileName && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileImage className="h-4 w-4" />
                      <span className="truncate">{fileName}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleExtract}
                disabled={!image || isProcessing}
                className="w-full"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Extracting{progress ? ` ${progress}%` : '...'}
                  </>
                ) : (
                  <>
                    <ScanFace className="h-5 w-5 mr-2" />
                    Extract
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Result Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Extraction Results</CardTitle>
            <CardDescription>Detected passport fields will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            {isProcessing ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Running OCR{progress ? ` (${progress}%)` : '...'}
                </p>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>
              </div>
            ) : ocrText !== null || mrzText !== null || fullError || mrzError ? (
              <div className="space-y-4">
                {fullError ? (
                  <pre className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-xs whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto text-destructive">
{`Full Page OCR Error:\n\n${fullError}`}
                  </pre>
                ) : (
                  <pre className="rounded-lg border border-border bg-muted/50 p-4 text-xs whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto">
{`----- RAW OCR (FULL PAGE) -----\n\n${ocrText ?? ''}`}
                  </pre>
                )}
                {mrzError ? (
                  <pre className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-xs whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto text-destructive">
{`MRZ OCR Error:\n\n${mrzError}`}
                  </pre>
                ) : (
                  <pre className="rounded-lg border border-border bg-muted/50 p-4 text-xs whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto">
{`----- MRZ OCR (CROPPED) -----${mrzModel ? `\nLoaded model:\n${mrzModel === 'mrz' ? 'mrz.traineddata' : 'eng.traineddata (fallback)'}` : ''}\n\n${mrzText ?? ''}`}
                  </pre>
                )}
                {mrzModelLoadFailure && (
                  <pre className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-xs whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto text-destructive">
{`MRZ model load failed

URL:
${mrzModelLoadFailure.url}

HTTP:
${mrzModelLoadFailure.httpStatus}

Network error:
${mrzModelLoadFailure.networkError}

CORS error:
${mrzModelLoadFailure.corsError}

Reason:
${mrzModelLoadFailure.reason}

Stack:
${mrzModelLoadFailure.stack}`}
                  </pre>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">Upload an image and press Extract to run OCR.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PassportExtractor;
