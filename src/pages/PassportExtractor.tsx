import { useState, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, ScanFace, Loader2, FileSpreadsheet, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { type PassportData } from '@/lib/mrzExtractor';
import { runMrzQueue } from '@/lib/mrzQueue';
import { toast } from '@/hooks/use-toast';

const MAX_FILES = 200;

type RowStatus = 'pending' | 'processing' | 'done' | 'error';

interface Row {
  id: string;
  file: File;
  status: RowStatus;
  data?: PassportData;
  error?: string;
  rawMrz?: string;
}

const FIELDS: Array<{ key: keyof PassportData; label: string }> = [
  { key: 'passportNumber', label: 'Passport Number' },
  { key: 'surname', label: 'Surname' },
  { key: 'givenName', label: 'Given Name' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'gender', label: 'Gender' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'expiryDate', label: 'Passport Expiry Date' },
];

const PassportExtractor = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallDone, setOverallDone] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);
  const cancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const done = rows.filter(r => r.status === 'done').length;
    const err = rows.filter(r => r.status === 'error').length;
    const pending = rows.filter(r => r.status === 'pending').length;
    return { done, err, pending, total: rows.length };
  }, [rows]);

  const handleFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    setRows(prev => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) {
        toast({ title: 'Limit reached', description: `Maximum ${MAX_FILES} passports.`, variant: 'destructive' });
        return prev;
      }
      const accepted = incoming.slice(0, room);
      if (incoming.length > accepted.length) {
        toast({ title: 'Some files skipped', description: `Only ${accepted.length} added (max ${MAX_FILES}).` });
      }
      const newRows: Row[] = accepted.map((f, i) => ({
        id: `${Date.now()}_${i}_${f.name}`,
        file: f,
        status: 'pending',
      }));
      return [...prev, ...newRows];
    });
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const removeRow = useCallback((id: string) => {
    if (isProcessing) return;
    setRows(prev => prev.filter(r => r.id !== id));
  }, [isProcessing]);

  const clearAll = useCallback(() => {
    if (isProcessing) return;
    setRows([]);
  }, [isProcessing]);

  const runExtraction = useCallback(async () => {
    if (rows.length === 0 || isProcessing) return;
    setIsProcessing(true);
    cancelRef.current = false;
    const jobs = rows
      .filter(r => r.status !== 'done')
      .map(r => ({ id: r.id, file: r.file }));
    setOverallDone(0);
    setOverallTotal(jobs.length);
    try {
      await runMrzQueue(jobs, {
        signal: { get cancelled() { return cancelRef.current; } },
        onOverall: (done, total) => {
          setOverallDone(done);
          setOverallTotal(total);
        },
        onUpdate: (u) => {
          setRows(prev => prev.map(r => {
            if (r.id !== u.id) return r;
            if (u.status === 'processing') return { ...r, status: 'processing', error: undefined };
            if (u.status === 'done' && u.result?.data) {
              return { ...r, status: 'done', data: u.result.data, rawMrz: u.result.rawMrz };
            }
            return { ...r, status: 'error', error: u.error || 'MRZ not found', rawMrz: u.result?.rawMrz };
          }));
        },
      });
    } catch (err) {
      toast({
        title: 'OCR engine failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
    setIsProcessing(false);
  }, [rows, isProcessing]);

  const stopExtraction = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const exportExcel = useCallback(() => {
    const done = rows.filter(r => r.status === 'done' && r.data);
    if (done.length === 0) {
      toast({ title: 'Nothing to export', description: 'No successfully extracted passports.', variant: 'destructive' });
      return;
    }
    const aoa: (string | number)[][] = [
      ['File Name', ...FIELDS.map(f => f.label)],
      ...done.map(r => [r.file.name, ...FIELDS.map(f => r.data![f.key] || '')]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Passports');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    XLSX.writeFile(wb, `passports_${stamp}.xlsx`);
  }, [rows]);

  const overallPct = overallTotal === 0
    ? (rows.length === 0 ? 0 : Math.round(((stats.done + stats.err) / rows.length) * 100))
    : Math.round((overallDone / overallTotal) * 100);

  return (
    <AppLayout>
      <Header title="Passport Extractor" />

      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Bulk Passport Extractor</h2>
          <p className="text-sm text-muted-foreground">
            Upload up to {MAX_FILES} passport images. Only the ICAO MRZ is read — fully on-device. Export all results as Excel.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />

            <button
              onClick={() => inputRef.current?.click()}
              disabled={isProcessing || rows.length >= MAX_FILES}
              className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-3 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="font-medium">Add passport images</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {rows.length}/{MAX_FILES} selected · PNG, JPG or JPEG
                </p>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-2">
              {!isProcessing ? (
                <Button onClick={runExtraction} disabled={rows.length === 0} size="lg">
                  <ScanFace className="h-5 w-5 mr-2" />
                  Extract {rows.length > 0 ? `(${rows.length})` : ''}
                </Button>
              ) : (
                <Button onClick={stopExtraction} variant="destructive" size="lg">
                  <X className="h-5 w-5 mr-2" /> Stop
                </Button>
              )}
              <Button onClick={exportExcel} disabled={stats.done === 0 || isProcessing} variant="outline" size="lg">
                <FileSpreadsheet className="h-5 w-5 mr-2" />
                Export Excel
              </Button>
            </div>

            {rows.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <span className="text-emerald-600 font-medium">{stats.done} done</span> ·{' '}
                  <span className="text-destructive font-medium">{stats.err} failed</span> ·{' '}
                  <span>{stats.pending} pending</span>
                </span>
                <button
                  onClick={clearAll}
                  disabled={isProcessing}
                  className="flex items-center gap-1 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" /> Clear all
                </button>
              </div>
            )}

            {isProcessing && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">
                    Processing {overallDone} of {overallTotal} (parallel)
                  </span>
                  <span className="text-muted-foreground">{overallPct}% overall</span>
                </div>
                <Progress value={overallPct} className="h-2" />
                <p className="text-[11px] text-muted-foreground truncate">
                  Running multiple OCR workers in parallel — {stats.done} done, {stats.err} failed.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Results</CardTitle>
              <CardDescription>Extracted MRZ data for each passport.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2 w-8"></th>
                      <th className="text-left px-3 py-2">File</th>
                      {FIELDS.map(f => (
                        <th key={f.key} className="text-left px-3 py-2 whitespace-nowrap">{f.label}</th>
                      ))}
                      <th className="text-right px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 align-top">
                          {r.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {r.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                          {r.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {r.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                        </td>
                        <td className="px-3 py-2 align-top max-w-[180px] truncate font-sans" title={r.file.name}>
                          {r.file.name}
                          {r.status === 'error' && r.error && (
                            <div className="text-[10px] text-destructive font-sans mt-0.5 whitespace-normal break-words">
                              {r.error}
                            </div>
                          )}
                        </td>
                        {FIELDS.map(f => (
                          <td key={f.key} className="px-3 py-2 align-top whitespace-nowrap">
                            {r.data?.[f.key] || <span className="text-muted-foreground/40">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 align-top text-right">
                          <button
                            onClick={() => removeRow(r.id)}
                            disabled={isProcessing}
                            className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                            aria-label="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default PassportExtractor;