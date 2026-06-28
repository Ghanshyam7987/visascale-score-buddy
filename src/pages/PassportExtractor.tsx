import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eraser,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Applicant,
  ApplicantField,
  ProcessingStage,
  STAGE_LABEL,
  computeStatus,
} from '@/lib/passport/types';
import { WorkerPoolExtractor } from '@/lib/passport/workerPoolExtractor';
import { emptyApplicant, runPipeline } from '@/lib/passport/pipeline';
import { exportApplicantsToExcel } from '@/lib/passport/excel';
import { sanitizeName } from '@/lib/mrzParser';

const MAX_ROWS = 200;
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

const COLUMNS: { key: ApplicantField; label: string; width: string }[] = [
  { key: 'surname', label: 'Surname', width: '130px' },
  { key: 'givenName', label: 'Given Name', width: '150px' },
  { key: 'gender', label: 'Gender', width: '80px' },
  { key: 'dateOfBirth', label: 'Date of Birth', width: '120px' },
  { key: 'dateOfExpiry', label: 'Date of Expiry', width: '120px' },
  { key: 'nationality', label: 'Nationality', width: '100px' },
  { key: 'passportNumber', label: 'Passport Number', width: '140px' },
];

function StatusBadge({ status }: { status: Applicant['status'] }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
        <CheckCircle2 className="h-4 w-4" /> Auto Verified
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
        <XCircle className="h-4 w-4" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
      <AlertTriangle className="h-4 w-4" /> Review
    </span>
  );
}

function formatEta(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function PassportExtractor() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<Applicant[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
    stage: ProcessingStage;
    etaSeconds: number | null;
  }>({ index: 0, total: 0, stage: 'idle', etaSeconds: null });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; key: ApplicantField } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId],
  );

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      rows.forEach((r) => URL.revokeObjectURL(r.imageUrl));
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFiles = useCallback(
    async (files: File[]) => {
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const f of files) {
        if (ACCEPTED_TYPES.includes(f.type.toLowerCase())) accepted.push(f);
        else rejected.push(f.name);
      }
      if (rejected.length) {
        toast.error(`Unsupported file type. Only PNG and JPEG are allowed.`);
      }
      if (!accepted.length) return;

      const available = MAX_ROWS - rows.length;
      if (available <= 0) {
        toast.error('Maximum 200 passports allowed.');
        return;
      }
      if (accepted.length > available) {
        toast.error('Maximum 200 passports allowed.');
      }
      const toProcess = accepted.slice(0, available);

      // Seed placeholder rows so the table & counter update immediately.
      const seeded = toProcess.map((file) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const imageUrl = URL.createObjectURL(file);
        return { row: emptyApplicant(id, imageUrl), file };
      });
      setRows((prev) => [...prev, ...seeded.map((s) => ({ ...s.row, status: 'review' as const }))]);

      setIsProcessing(true);
      setProgress({ index: 0, total: toProcess.length, stage: 'preparing', etaSeconds: null });

      const extractor = new WorkerPoolExtractor();
      const controller = new AbortController();
      abortRef.current = controller;
      await extractor.init();

      try {
        await runPipeline(
          seeded.map((s) => ({ id: s.row.id, file: s.file })),
          extractor,
          {
            onProgress: (p) => setProgress(p),
            onItem: (id, fields, err) => {
              if (err || !fields) {
                setRows((prev) =>
                  prev.map((r) => (r.id === id ? { ...r, status: 'failed' } : r)),
                );
                return;
              }
              setRows((prev) =>
                prev.map((r) => (r.id === id ? { ...r, ...fields } : r)),
              );
            },
          },
          controller.signal,
        );
        toast.success(`Processed ${toProcess.length} passport${toProcess.length > 1 ? 's' : ''}.`);
      } finally {
        await extractor.dispose();
        abortRef.current = null;
        setIsProcessing(false);
        setProgress({ index: 0, total: 0, stage: 'idle', etaSeconds: null });
      }
    },
    [rows.length],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files));
  };

  const updateCell = (id: string, key: ApplicantField, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const sanitized =
          key === 'surname' || key === 'givenName' ? sanitizeName(value) : value;
        const updated = { ...r, [key]: sanitized };
        const { id: _i, imageUrl: _u, status: _s, ...rest } = updated;
        return { ...updated, status: computeStatus(rest, r.status === 'verified') };
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
    setConfirmDelete(null);
  };

  const clearSession = () => {
    abortRef.current?.abort();
    rows.forEach((r) => URL.revokeObjectURL(r.imageUrl));
    setRows([]);
    setSelectedId(null);
    setEditingCell(null);
    setConfirmClear(false);
    toast.success('Session cleared.');
  };

  const handleCellKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
  ) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setEditingCell(null);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const nextCol = e.shiftKey ? colIdx - 1 : colIdx + 1;
      if (nextCol >= 0 && nextCol < COLUMNS.length) {
        updateCell(rows[rowIdx].id, COLUMNS[colIdx].key, (e.target as HTMLInputElement).value);
        setEditingCell({ id: rows[rowIdx].id, key: COLUMNS[nextCol].key });
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextRow = e.key === 'ArrowDown' ? rowIdx + 1 : rowIdx - 1;
      if (nextRow >= 0 && nextRow < rows.length) {
        updateCell(rows[rowIdx].id, COLUMNS[colIdx].key, (e.target as HTMLInputElement).value);
        setEditingCell({ id: rows[nextRow].id, key: COLUMNS[colIdx].key });
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
            <h1 className="text-base sm:text-lg font-semibold">Bulk Passport Extractor</h1>
          </div>
          <div className="text-xs sm:text-sm font-medium text-muted-foreground">
            Applicants:{' '}
            <span className="text-foreground font-semibold">{rows.length}</span> / {MAX_ROWS}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Security banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
          <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">100% Secure</p>
            <p className="text-muted-foreground">
              Files are processed completely inside your browser. Nothing is uploaded. Nothing is
              stored on our servers.
            </p>
          </div>
        </div>

        {/* Upload zone */}
        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`p-8 border-2 border-dashed transition-colors ${
            isProcessing ? 'cursor-default' : 'cursor-pointer'
          } ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
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
            <p className="font-medium">
              Drag &amp; drop passport images here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              JPEG / PNG · up to {MAX_ROWS} passports per session
            </p>
          </div>
        </Card>

        {/* Processing panel */}
        {isProcessing && (
          <Card className="p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">
                Processing Passport {progress.index} of {progress.total}
              </span>
              <span className="text-muted-foreground">
                Remaining: {Math.max(progress.total - progress.index, 0)} · ETA:{' '}
                {formatEta(progress.etaSeconds)}
              </span>
            </div>
            <Progress
              value={(progress.index / Math.max(progress.total, 1)) * 100}
            />
            <p className="text-xs text-muted-foreground">
              Current stage: <span className="text-foreground">{STAGE_LABEL[progress.stage]}</span>
            </p>
          </Card>
        )}

        {/* Global actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => exportApplicantsToExcel(rows)}
            disabled={!rows.length || isProcessing}
          >
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmClear(true)}
            disabled={!rows.length}
          >
            <Eraser className="h-4 w-4" /> Clear Session
          </Button>
        </div>

        {/* Table + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <Card className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '120px' }} />
                {COLUMNS.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: '70px' }} />
              </colgroup>
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2 font-medium truncate">Status</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="text-left p-2 font-medium truncate">
                      {c.label}
                    </th>
                  ))}
                  <th className="text-left p-2 font-medium truncate">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 2}
                      className="text-center p-8 text-muted-foreground"
                    >
                      Upload passport images to begin.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIdx) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        if (isProcessing) return;
                        setSelectedId(row.id);
                      }}
                      className={`border-t cursor-pointer hover:bg-muted/30 ${
                        selectedId === row.id ? 'bg-muted/50' : ''
                      }`}
                    >
                      <td className="p-2">
                        <StatusBadge status={row.status} />
                      </td>
                      {COLUMNS.map((col, colIdx) => {
                        const isEditing =
                          editingCell?.id === row.id && editingCell.key === col.key;
                        return (
                          <td
                            key={col.key}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingCell({ id: row.id, key: col.key });
                            }}
                            className="p-2 overflow-hidden"
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                defaultValue={String(row[col.key] ?? '')}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  updateCell(row.id, col.key, e.target.value);
                                  setEditingCell(null);
                                }}
                                onKeyDown={(e) => handleCellKey(e, rowIdx, colIdx)}
                                className="w-full px-1 py-0.5 border border-primary rounded outline-none bg-background"
                              />
                            ) : (
                              <span
                                className="block truncate"
                                title={String(row[col.key] ?? '')}
                              >
                                {String(row[col.key] ?? '') || (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(row.id);
                          }}
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
          <Card className="p-3 h-fit lg:sticky lg:top-20">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Preview</h3>
              {selectedRow && (
                <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {selectedRow && !isProcessing ? (
              <>
                <div className="overflow-hidden rounded border bg-muted/30 aspect-[4/3] flex items-center justify-center">
                  <img
                    src={selectedRow.imageUrl}
                    alt="Passport preview"
                    className="max-w-full max-h-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
                    Reset
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                {isProcessing
                  ? 'Preview is paused while OCR is running.'
                  : 'Click a row to preview that passport.'}
              </p>
            )}
          </Card>
        </div>
      </main>

      {/* Delete row confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this applicant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the row and its preview from this session. The action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteRow(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear session confirm */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire session?</AlertDialogTitle>
            <AlertDialogDescription>
              All applicants, previews and in-memory data will be wiped from this browser. Nothing
              was ever uploaded — there is nothing to recover.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={clearSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}