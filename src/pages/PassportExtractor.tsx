import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Trash2, RotateCw, ShieldCheck, CheckCircle2, AlertTriangle, X, Eraser, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { createWorker, PSM } from 'tesseract.js';
import * as XLSX from 'xlsx';
import { parseMrz, sanitizeName } from '@/lib/mrzParser';

const MAX_ROWS = 200;

interface Applicant {
  id: string;
  status: 'verified' | 'review';
  surname: string;
  givenName: string;
  gender: string;
  dateOfBirth: string;
  placeOfBirth: string;
  dateOfIssue: string;
  placeOfIssue: string;
  dateOfExpiry: string;
  nationality: string;
  imageUrl: string;
}

const EDITABLE_FIELDS: (keyof Applicant)[] = [
  'surname', 'givenName', 'gender', 'dateOfBirth', 'placeOfBirth', 'dateOfIssue', 'placeOfIssue', 'dateOfExpiry', 'nationality',
];

const REQUIRED_FIELDS: (keyof Applicant)[] = [
  'surname', 'givenName', 'gender', 'dateOfBirth', 'placeOfBirth', 'dateOfIssue', 'placeOfIssue', 'dateOfExpiry', 'nationality',
];
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const PLACE_RE = /^[A-Za-z\s,]+$/;

function computeStatus(
  data: Omit<Applicant, 'id' | 'imageUrl' | 'status'>,
  checksumValid: boolean,
): 'verified' | 'review' {
  if (!checksumValid) return 'review';
  for (const f of REQUIRED_FIELDS) {
    const v = (data as Record<string, string>)[f];
    if (!v || !String(v).trim()) return 'review';
  }
  if (!DATE_RE.test(data.dateOfBirth) || !DATE_RE.test(data.dateOfExpiry) || !DATE_RE.test(data.dateOfIssue)) {
    return 'review';
  }
  return 'verified';
}

const COLUMNS: { key: keyof Applicant; label: string }[] = [
  { key: 'surname', label: 'Surname' },
  { key: 'givenName', label: 'Given Name' },
  { key: 'gender', label: 'Gender' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'placeOfBirth', label: 'Place of Birth' },
  { key: 'dateOfIssue', label: 'Date of Issue' },
  { key: 'placeOfIssue', label: 'Place of Issue' },
  { key: 'dateOfExpiry', label: 'Date of Expiry' },
  { key: 'nationality', label: 'Nationality' },
];

function validPlace(value: string): string {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return '';
  if (!PLACE_RE.test(v)) return '';
  if (v.length < 2 || v.length > 60) return '';
  return v.toUpperCase();
}

function normalizeDate(raw: string): string {
  const m = raw.match(/(\d{2})[\/\-\.\s](\d{2})[\/\-\.\s](\d{2,4})/);
  if (!m) return '';
  let [, dd, mm, yy] = m;
  if (yy.length === 2) {
    const cy = new Date().getFullYear() % 100;
    yy = (parseInt(yy, 10) <= cy ? '20' : '19') + yy;
  }
  return `${dd}/${mm}/${yy}`;
}

/** Render image (optionally rotated) onto a canvas, return the canvas. */
async function renderToCanvas(src: string, rotationDeg = 0): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img load')); });
  const rad = (rotationDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = Math.round(img.width * cos + img.height * sin);
  const h = Math.round(img.width * sin + img.height * cos);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas;
}

/** High-contrast grayscale + binarization to wash out holograms/watermarks. */
function binarize(source: HTMLCanvasElement, threshold = 150): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width; out.height = source.height;
  const sctx = source.getContext('2d')!;
  const octx = out.getContext('2d')!;
  const img = sctx.getImageData(0, 0, source.width, source.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Luminance
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Boost contrast aggressively, then threshold.
    const boosted = (y - 128) * 1.6 + 128;
    const v = boosted < threshold ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Crop a sub-region from a canvas. */
function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

async function extractFromCanvas(
  baseCanvas: HTMLCanvasElement,
  worker: Tesseract.Worker,
): Promise<Omit<Applicant, 'id' | 'imageUrl'>> {
  const W = baseCanvas.width;
  const H = baseCanvas.height;

  // Visual zone: upper 80% — preprocessed (grayscale + binarization).
  const upperRaw = cropCanvas(baseCanvas, 0, 0, W, Math.round(H * 0.8));
  const upperBin = binarize(upperRaw, 150);

  // MRZ zone: bottom 22% — preprocessed with a tighter threshold for sharp glyphs.
  const mrzRaw = cropCanvas(baseCanvas, 0, Math.round(H * 0.78), W, Math.round(H * 0.22));
  const mrzBin = binarize(mrzRaw, 130);

  // --- MRZ pass: strict whitelist so `<` is never misread as K/L. ---
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });
  const mrzRes = await worker.recognize(mrzBin);
  const mrz = parseMrz(mrzRes.data.text || '');

  // --- Visual zone pass: default alphabet for human-readable text. ---
  await worker.setParameters({
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: PSM.AUTO,
  });
  const upperRes = await worker.recognize(upperBin);
  const upperText = upperRes.data.text || '';
  const upperLines = upperText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // --- Place of Birth / Place of Issue heuristics ---
  let placeOfBirth = '';
  let placeOfIssue = '';
  for (let i = 0; i < upperLines.length; i++) {
    const line = upperLines[i];
    if (!placeOfBirth && /place\s*of\s*birth/i.test(line)) {
      const tail = line.split(/place\s*of\s*birth/i)[1] || '';
      const candidate = tail.replace(/[:\-]/g, '').trim() || upperLines[i + 1] || '';
      placeOfBirth = validPlace(candidate);
    }
    if (!placeOfIssue && /place\s*of\s*issue/i.test(line)) {
      const tail = line.split(/place\s*of\s*issue/i)[1] || '';
      const candidate = tail.replace(/[:\-]/g, '').trim() || upperLines[i + 1] || '';
      placeOfIssue = validPlace(candidate);
    }
  }

  // PLACE OF ISSUE FIX: regex fallback against the raw upper-zone text
  if (!placeOfIssue) {
    const poiMatch = upperText.match(/Place of Issue[\s\S]*?([A-Z]{3,})/i);
    if (poiMatch) {
      placeOfIssue = validPlace(poiMatch[1]) || poiMatch[1].toUpperCase();
    }
  }

  // --- Date elimination strategy ---
  // Collect all DD/MM/YYYY (and short variants) from the upper text.
  const dateMatches = Array.from(upperText.matchAll(/\b(\d{2}[\/\-\.\s]\d{2}[\/\-\.\s]\d{2,4})\b/g))
    .map((m) => normalizeDate(m[1]))
    .filter(Boolean);
  const uniqueDates = Array.from(new Set(dateMatches));

  const dob = mrz?.dateOfBirth || '';
  const expiry = mrz?.dateOfExpiry || '';
  const dateOfIssue = uniqueDates.find((d) => d !== dob && d !== expiry) || '';

  if (mrz) {
    const base = {
      surname: sanitizeName(mrz.surname),
      givenName: sanitizeName(mrz.givenName),
      gender: mrz.gender,
      dateOfBirth: mrz.dateOfBirth,
      placeOfBirth,
      dateOfIssue,
      placeOfIssue,
      dateOfExpiry: mrz.dateOfExpiry,
      nationality: mrz.nationality,
    };
    return { ...base, status: computeStatus(base, mrz.checksumValid) };
  }

  return {
    status: 'review',
    surname: '', givenName: '', gender: '', dateOfBirth: '',
    placeOfBirth, dateOfIssue, placeOfIssue, dateOfExpiry: '', nationality: '',
  };
}

async function extractFromImage(
  src: string,
  worker: Tesseract.Worker,
  rotationDeg = 0,
): Promise<Omit<Applicant, 'id' | 'imageUrl'>> {
  const canvas = await renderToCanvas(src, rotationDeg);
  return extractFromCanvas(canvas, worker);
}

export default function PassportExtractor() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Applicant[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [editingCell, setEditingCell] = useState<{ id: string; key: keyof Applicant } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [rotated, setRotated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  useEffect(() => {
    return () => {
      rows.forEach((r) => URL.revokeObjectURL(r.imageUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => /image\/(jpeg|jpg|png)/i.test(f.type));
    if (!images.length) {
      toast.error('Please upload JPEG or PNG images.');
      return;
    }
    const available = MAX_ROWS - rows.length;
    if (available <= 0) {
      toast.error(`Maximum of ${MAX_ROWS} applicants reached.`);
      return;
    }
    const toProcess = images.slice(0, available);
    if (toProcess.length < images.length) {
      toast.warning(`Only ${toProcess.length} files added — ${MAX_ROWS} row limit.`);
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: toProcess.length });

    const worker = await createWorker('eng');

    try {
      for (let i = 0; i < toProcess.length; i++) {
        const file = toProcess[i];
        setProgress({ current: i + 1, total: toProcess.length });
        const url = URL.createObjectURL(file);
        try {
          const data = await extractFromImage(url, worker, 0);
          const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
          setRows((prev) => [...prev, { id, imageUrl: url, ...data }]);
        } catch (e) {
          console.error('OCR failed for', file.name, e);
          const id = `${Date.now()}-${i}-err`;
          setRows((prev) => [...prev, {
            id, imageUrl: url, status: 'review',
            surname: '', givenName: '', gender: '', dateOfBirth: '',
            placeOfBirth: '', dateOfIssue: '', placeOfIssue: '', dateOfExpiry: '', nationality: '',
          }]);
        }
      }
      toast.success(`Processed ${toProcess.length} passport${toProcess.length > 1 ? 's' : ''}.`);
    } finally {
      await worker.terminate();
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [rows.length]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files));
  };

  const updateCell = (id: string, key: keyof Applicant, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const sanitized = key === 'surname' || key === 'givenName' ? sanitizeName(value) : value;
        const updated = { ...r, [key]: sanitized };
        // Re-evaluate verification on every edit. Without re-running MRZ we can only downgrade.
        const { id: _i, imageUrl: _u, status: _s, ...rest } = updated;
        const recomputed = computeStatus(rest, r.status === 'verified');
        return { ...updated, status: recomputed };
      }),
    );
  };

  const deleteRow = (id: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row) URL.revokeObjectURL(row.imageUrl);
      return prev.filter((r) => r.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  const clearAll = () => {
    rows.forEach((r) => URL.revokeObjectURL(r.imageUrl));
    setRows([]);
    setSelectedId(null);
    toast.success('Session data cleared.');
  };

  const exportExcel = () => {
    if (!rows.length) {
      toast.error('No data to export.');
      return;
    }
    const data = rows.map((r) => ({
      Status: r.status === 'verified' ? 'Auto-Verified' : 'Review Needed',
      Surname: r.surname,
      'Given Name': r.givenName,
      Gender: r.gender,
      'Date of Birth': r.dateOfBirth,
      'Place of Birth': r.placeOfBirth,
      'Date of Issue': r.dateOfIssue,
      'Place of Issue': r.placeOfIssue,
      'Date of Expiry': r.dateOfExpiry,
      Nationality: r.nationality,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Applicants');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Visa_Applicants_Export_${date}.xlsx`);
  };

  async function rescanCurrent() {
    if (!selectedRow) return;
    setIsRescanning(true);
    try {
      const worker = await createWorker('eng');
      try {
        const data = await extractFromImage(selectedRow.imageUrl, worker, rotation);
        setRows((prev) => prev.map((r) => (r.id === selectedRow.id ? { ...r, ...data } : r)));
        toast.success('Passport re-scanned.');
        setRotated(false);
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      console.error(e);
      toast.error('Re-scan failed.');
    } finally {
      setIsRescanning(false);
    }
  }

  const handleCellKey = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setEditingCell(null);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const nextCol = e.shiftKey ? colIdx - 1 : colIdx + 1;
      if (nextCol >= 0 && nextCol < EDITABLE_FIELDS.length) {
        setEditingCell({ id: rows[rowIdx].id, key: EDITABLE_FIELDS[nextCol] });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">Bulk Passport Extractor</h1>
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Applicants: <span className="text-foreground font-semibold">{rows.length}</span> / {MAX_ROWS}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Privacy banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm">
            <strong>100% Secure:</strong> Files are processed offline in your browser and NEVER saved to our servers.
          </p>
        </div>

        {/* Upload zone */}
        <Card
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-8 border-2 border-dashed cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            multiple
            hidden
            onChange={handleFileInput}
          />
          <div className="flex flex-col items-center text-center gap-2">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Drag & drop passport images here, or click to browse</p>
            <p className="text-xs text-muted-foreground">JPEG / PNG · up to {MAX_ROWS} applicants per session</p>
          </div>

          {isProcessing && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Processing {progress.current} of {progress.total} passports...</span>
                <span>{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
              </div>
              <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} />
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportExcel} disabled={!rows.length}>
            <Download className="h-4 w-4" /> Export to Excel
          </Button>
          <Button variant="outline" onClick={clearAll} disabled={!rows.length}>
            <Eraser className="h-4 w-4" /> Clear Session Data
          </Button>
        </div>

        {/* Table + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <Card className="overflow-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '110px' }} />
                {COLUMNS.map((c) => (
                  <col key={c.key} style={{ width: c.key === 'gender' ? '70px' : '120px' }} />
                ))}
                <col style={{ width: '60px' }} />
              </colgroup>
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium truncate">Status</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="text-left p-2 font-medium truncate">{c.label}</th>
                  ))}
                  <th className="text-left p-2 font-medium truncate">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 2} className="text-center p-8 text-muted-foreground">
                      Upload passport images to begin.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIdx) => (
                    <tr
                      key={row.id}
                      onClick={() => { setSelectedId(row.id); setRotation(0); setRotated(false); }}
                      className={`border-t cursor-pointer hover:bg-muted/30 ${selectedId === row.id ? 'bg-muted/50' : ''}`}
                    >
                      <td className="p-2">
                        {row.status === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4" /> Auto-Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                            <AlertTriangle className="h-4 w-4" /> Review
                          </span>
                        )}
                      </td>
                      {COLUMNS.map((col, colIdx) => {
                        const isEditing = editingCell?.id === row.id && editingCell.key === col.key;
                        return (
                          <td
                            key={col.key}
                            onDoubleClick={(e) => { e.stopPropagation(); setEditingCell({ id: row.id, key: col.key }); }}
                            className="p-2 overflow-hidden"
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                defaultValue={String(row[col.key] ?? '')}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => { updateCell(row.id, col.key, e.target.value); setEditingCell(null); }}
                                onKeyDown={(e) => handleCellKey(e, rowIdx, colIdx)}
                                className="w-full px-1 py-0.5 border border-primary rounded outline-none bg-background"
                              />
                            ) : (
                              <span
                                className="block truncate"
                                title={String(row[col.key] ?? '')}
                              >
                                {String(row[col.key] ?? '') || <span className="text-muted-foreground italic">—</span>}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); deleteRow(row.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>

          {/* Preview panel */}
          <Card className="p-3 h-fit sticky top-20">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Preview</h3>
              {selectedRow && (
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" onClick={() => { setRotation((r) => (r - 90 + 360) % 360); setRotated(true); }}>
                    <RotateCw className="h-4 w-4 -scale-x-100" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => { setRotation((r) => (r + 90) % 360); setRotated(true); }}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {selectedRow ? (
              <>
                <div className="overflow-hidden rounded border bg-muted/30 aspect-[4/3] flex items-center justify-center">
                  <img
                    src={selectedRow.imageUrl}
                    alt="Passport"
                    className="max-w-full max-h-full object-contain transition-transform"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                </div>
                {rotated && (
                  <Button
                    onClick={rescanCurrent}
                    disabled={isRescanning}
                    className="w-full mt-2"
                  >
                    {isRescanning ? 'Re-scanning...' : 'Re-Scan Passport'}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                Click a row to preview that passport.
              </p>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}