import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileSpreadsheet, Trash2, RotateCw, ShieldCheck, CheckCircle2, AlertTriangle, X, Eraser, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { createWorker } from 'tesseract.js';
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
  dateOfExpiry: string;
  nationality: string;
  imageUrl: string;
}

const EDITABLE_FIELDS: (keyof Applicant)[] = [
  'surname', 'givenName', 'gender', 'dateOfBirth', 'placeOfBirth', 'dateOfIssue', 'dateOfExpiry', 'nationality',
];

const REQUIRED_FIELDS: (keyof Applicant)[] = [
  'surname', 'givenName', 'gender', 'dateOfBirth', 'placeOfBirth', 'dateOfIssue', 'dateOfExpiry', 'nationality',
];
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

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
  { key: 'dateOfExpiry', label: 'Date of Expiry' },
  { key: 'nationality', label: 'Nationality' },
];

async function extractFromImage(
  file: File | Blob | string,
  worker: Tesseract.Worker,
): Promise<Omit<Applicant, 'id' | 'imageUrl'>> {
  // Run full-image OCR once.
  const { data } = await worker.recognize(file);
  const text = data.text || '';

  const mrz = parseMrz(text);

  // Try to extract place of birth and date of issue from upper section heuristically.
  const upperLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let placeOfBirth = '';
  let dateOfIssue = '';
  for (const line of upperLines) {
    if (!placeOfBirth && /place\s*of\s*birth/i.test(line)) {
      placeOfBirth = line.split(/place\s*of\s*birth/i)[1]?.replace(/[:\-]/g, '').trim() || '';
    }
    if (!dateOfIssue) {
      const m = line.match(/(?:date\s*of\s*issue|issue\s*date)[^\d]*(\d{2}[\/\-\.\s]\d{2}[\/\-\.\s]\d{2,4})/i);
      if (m) dateOfIssue = m[1].replace(/\s/g, '/').replace(/[-.]/g, '/');
    }
  }

  if (mrz) {
    const base = {
      surname: sanitizeName(mrz.surname),
      givenName: sanitizeName(mrz.givenName),
      gender: mrz.gender,
      dateOfBirth: mrz.dateOfBirth,
      placeOfBirth,
      dateOfIssue,
      dateOfExpiry: mrz.dateOfExpiry,
      nationality: mrz.nationality,
    };
    return { ...base, status: computeStatus(base, mrz.checksumValid) };
  }

  return {
    status: 'review',
    surname: '', givenName: '', gender: '', dateOfBirth: '',
    placeOfBirth, dateOfIssue, dateOfExpiry: '', nationality: '',
  };
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
        try {
          const data = await extractFromImage(file, worker);
          const url = URL.createObjectURL(file);
          const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
          setRows((prev) => [...prev, { id, imageUrl: url, ...data }]);
        } catch (e) {
          console.error('OCR failed for', file.name, e);
          const url = URL.createObjectURL(file);
          const id = `${Date.now()}-${i}-err`;
          setRows((prev) => [...prev, {
            id, imageUrl: url, status: 'review',
            surname: '', givenName: '', gender: '', dateOfBirth: '',
            placeOfBirth: '', dateOfIssue: '', dateOfExpiry: '', nationality: '',
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
      // Render the rotated image to a canvas, then OCR.
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedRow.imageUrl;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img load')); });
      const rad = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      const w = img.width * cos + img.height * sin;
      const h = img.width * sin + img.height * cos;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const dataUrl = canvas.toDataURL('image/png');

      const worker = await createWorker('eng');
      try {
        const data = await extractFromImage(dataUrl, worker);
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
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Status</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="text-left p-2 font-medium whitespace-nowrap">{c.label}</th>
                  ))}
                  <th className="text-left p-2 font-medium">Action</th>
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
                            className="p-2 min-w-[110px]"
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
                              <span className="block truncate">{String(row[col.key] ?? '') || <span className="text-muted-foreground italic">—</span>}</span>
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