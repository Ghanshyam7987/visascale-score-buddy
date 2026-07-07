import { useState, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, X, ScanFace, FileImage, Loader2 } from 'lucide-react';
import {
  extractPassportMrz,
  type MrzResult,
  type PassportData,
} from '@/lib/mrzExtractor';

const FIELD_LABELS: Array<{ key: keyof PassportData; label: string }> = [
  { key: 'passportNumber', label: 'Passport Number' },
  { key: 'surname', label: 'Surname' },
  { key: 'givenName', label: 'Given Name' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'gender', label: 'Gender' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'expiryDate', label: 'Passport Expiry Date' },
];

const PassportExtractor = () => {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<MrzResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setResult(null);
    setProgress(0);
    setProgressLabel('');
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const objectUrl = URL.createObjectURL(f);
    setImage(objectUrl);
    setFileName(f.name);
    setFile(f);
    reset();
  }, [reset]);

  const handleUploadClick = useCallback(() => inputRef.current?.click(), []);

  const handleRemove = useCallback(() => {
    if (image) URL.revokeObjectURL(image);
    setImage(null);
    setFileName(null);
    setFile(null);
    reset();
    if (inputRef.current) inputRef.current.value = '';
  }, [image, reset]);

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setIsProcessing(true);
    reset();
    try {
      const r = await extractPassportMrz(file, {
        onProgress: (p, label) => {
          setProgress(Math.round(p * 100));
          setProgressLabel(label);
        },
      });
      setResult(r);
    } catch (err) {
      setResult({
        ok: false,
        rawMrz: '',
        modelUsed: 'mrz',
        attempts: [],
        warnings: [],
        error: err instanceof Error ? (err.stack || err.message) : String(err),
      });
    } finally {
      setIsProcessing(false);
    }
  }, [file, reset]);

  return (
    <AppLayout>
      <Header title="Passport Extractor" />

      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Passport Extractor</h2>
          <p className="text-sm text-muted-foreground">
            Upload a passport image. Only the ICAO MRZ is read — no visual OCR.
          </p>
        </div>

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
                    <img src={image} alt="Selected passport preview" className="w-full h-full object-contain" />
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

              <Button onClick={handleExtract} disabled={!image || isProcessing} className="w-full" size="lg">
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Extracting {progress}%
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Extraction Results</CardTitle>
            <CardDescription>MRZ-derived passport fields.</CardDescription>
          </CardHeader>
          <CardContent>
            {isProcessing ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {progressLabel || 'Working...'} ({progress}%)
                </p>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {result.ok && result.data ? (
                  <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                    {FIELD_LABELS.map(({ key, label }) => (
                      <div key={key} className="flex justify-between items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {label}
                        </span>
                        <span className="text-sm font-mono font-semibold text-right break-all">
                          {result.data![key] || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
                    <p className="text-sm font-semibold text-destructive">MRZ extraction failed</p>
                    <p className="text-xs text-destructive whitespace-pre-wrap break-words font-mono">
                      {result.error || 'Unknown error'}
                    </p>
                  </div>
                )}

                {result.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                )}

                <details className="rounded-lg border border-border bg-muted/30">
                  <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted-foreground">
                    Diagnostics ({result.modelUsed} model, {result.attempts.length} attempt{result.attempts.length === 1 ? '' : 's'})
                  </summary>
                  <div className="px-4 py-3 space-y-3">
                    {result.rawMrz && (
                      <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-background rounded p-2 border border-border">
{result.rawMrz}
                      </pre>
                    )}
                    <div className="space-y-1 text-[11px] font-mono">
                      {result.attempts.map((a, i) => (
                        <div key={i} className="flex gap-2">
                          <span className={a.parsed && a.checksumsValid ? 'text-emerald-600' : a.parsed ? 'text-amber-600' : 'text-destructive'}>
                            {a.parsed && a.checksumsValid ? '✓' : a.parsed ? '~' : '✗'}
                          </span>
                          <span>{a.strategy}</span>
                          {a.error && <span className="text-muted-foreground truncate">— {a.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">Upload an image and press Extract to read the MRZ.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PassportExtractor;
