import { useState, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, X, ScanFace, FileImage, Loader2 } from 'lucide-react';
import Tesseract from 'tesseract.js';

const PassportExtractor = () => {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
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
    setError(null);
    setProgress(0);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [image]);

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setOcrText(null);
    setProgress(0);
    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      setOcrText(result.data.text ?? '');
    } catch (err) {
      console.error('OCR failed:', err);
      setError(err instanceof Error ? err.message : 'OCR failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [file]);

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
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : ocrText !== null ? (
              <pre className="rounded-lg border border-border bg-muted/50 p-4 text-xs whitespace-pre-wrap break-words font-mono max-h-[500px] overflow-auto">
{`----- RAW OCR TEXT -----\n\n${ocrText}`}
              </pre>
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
