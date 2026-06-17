import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseStatementFromAOA, runVORules, VOResult } from '@/lib/voMathEngine';
import { PrivacyNote } from './PrivacyNote';

const VALID_EXT = ['xlsx', 'xls'];
const VALID_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

interface Props {
  onComplete: (result: VOResult, fileName: string) => void;
  employmentType?: string;
}

export function BankAnalyzerStep({ onComplete, employmentType = 'Salaried' }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VOResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [tripCost, setTripCost] = useState('150000');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExt = VALID_EXT.includes(ext);
    const validMime = VALID_MIME.includes(file.type) || file.type === '';
    if (!validExt || !validMime) {
      const msg = 'Invalid file format. Please upload your bank statement in Excel (.xlsx or .xls) format only.';
      setError(msg);
      toast.error(msg);
      return;
    }
    setParsing(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      let txns: ReturnType<typeof parseStatementFromAOA> = [];
      let lastErr: Error | null = null;
      for (const name of wb.SheetNames) {
        try {
          const sheet = wb.Sheets[name];
          const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
          const parsed = parseStatementFromAOA(aoa);
          if (parsed.length > txns.length) txns = parsed;
        } catch (e: any) {
          lastErr = e;
        }
      }
      if (!txns.length) throw lastErr || new Error('No transactions detected in this workbook.');
      const vo = runVORules(txns, Number(tripCost) || 0, employmentType);
      setResult(vo);
      onComplete(vo, file.name);
    } catch (e: any) {
      const msg = e?.message || 'Failed to parse the bank statement.';
      setError(msg);
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  }, [tripCost, onComplete, employmentType]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    setResult(null); setError(null); setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold text-sm">2</div>
        <div>
          <h2 className="text-xl font-bold leading-tight">Verify Your Financials</h2>
          <p className="text-xs text-muted-foreground">Upload your bank statement (Excel) for a visa-officer style audit.</p>
        </div>
      </div>

      <Card className="border-2 border-dashed bg-gradient-to-br from-indigo-50/40 to-blue-50/40 dark:from-indigo-950/20 dark:to-blue-950/20">
        <CardContent className="p-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trip-cost" className="text-xs font-semibold">Estimated Trip Cost (₹)</Label>
            <Input
              id="trip-cost"
              type="number"
              value={tripCost}
              onChange={e => setTripCost(e.target.value)}
              placeholder="150000"
              min={0}
            />
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              dragActive ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/60 hover:bg-muted/30'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {parsing ? (
              <div className="flex flex-col items-center gap-2 text-primary">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium">Analysing locally on your device…</p>
              </div>
            ) : fileName && !error ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <p className="font-semibold text-sm">{fileName}</p>
                <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reset(); }}>
                  <X className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <p className="font-semibold text-sm">Drop your Excel statement here</p>
                <p className="text-xs text-muted-foreground">or click to browse — only .xlsx / .xls accepted</p>
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <PrivacyNote />
        </CardContent>
      </Card>

      {result && <VOResultCards result={result} />}
    </motion.section>
  );
}

function VOResultCards({ result }: { result: VOResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Avg Monthly Inflow" value={`₹${Math.round(result.avgMonthlyInflow).toLocaleString('en-IN')}`} />
        <Stat label="Avg Balance" value={`₹${Math.round(result.avgBalance).toLocaleString('en-IN')}`} />
        <Stat label="Months Covered" value={String(result.monthsCovered)} />
        <Stat label="Debits / Month" value={result.debitsPerMonth.toFixed(1)} />
      </div>

      <div className="space-y-2">
        {result.flags.map(f => <FlagCard key={f.id} flag={f} />)}
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <p className="text-base font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function FlagCard({ flag }: { flag: VOResult['flags'][number] }) {
  const styles = {
    red:    { bg: 'bg-destructive/10 border-destructive/30', text: 'text-destructive', icon: AlertCircle, tag: 'Critical' },
    yellow: { bg: 'bg-warning/10 border-warning/30',         text: 'text-warning',     icon: AlertTriangle, tag: 'Warning' },
    green:  { bg: 'bg-success/10 border-success/30',         text: 'text-success',     icon: CheckCircle2, tag: 'Pass' },
  }[flag.level];
  const Icon = styles.icon;
  return (
    <Card className={`border ${styles.bg}`}>
      <CardContent className="p-3 flex gap-3 items-start">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${styles.text}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${styles.text}`}>{styles.tag}</span>
          </div>
          <p className="font-semibold text-sm">{flag.title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{flag.detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}