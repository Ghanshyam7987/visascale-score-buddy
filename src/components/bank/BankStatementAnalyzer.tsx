import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Loader2, Lock, Sparkles, TrendingUp, TrendingDown,
  CheckCircle2, AlertTriangle, XCircle, Wallet, ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  extractTransactionsFromPDF, runVisaMathEngine, AnalysisResults, RuleResult,
} from '@/lib/bankStatementEngine';

const LOADING_STEPS = [
  'Extracting text from statement...',
  'Parsing transactions...',
  'Running Visa Math Engine...',
  'Compiling Report...',
];

const formatINR = (n: number) =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

export function BankStatementAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) return;
    setFile(f);
    setResults(null);
    setError(null);
    setIsAnalyzing(true);
    setLoadingStep(0);

    const stepInterval = setInterval(() => {
      setLoadingStep((s) => (s + 1 < LOADING_STEPS.length ? s + 1 : s));
    }, 700);

    try {
      const txns = await extractTransactionsFromPDF(f);
      if (txns.length === 0) {
        throw new Error(
          'Could not detect any transactions. The PDF may be scanned/image-based or password protected. Please upload a text-based PDF statement downloaded from your bank.',
        );
      }
      const res = runVisaMathEngine(txns);
      clearInterval(stepInterval);
      setLoadingStep(LOADING_STEPS.length - 1);
      setTimeout(() => {
        setResults(res);
        setIsAnalyzing(false);
      }, 400);
    } catch (e: any) {
      clearInterval(stepInterval);
      setError(e?.message || 'Failed to read this PDF.');
      setIsAnalyzing(false);
    }
  }, []);

  const reset = () => {
    setFile(null);
    setResults(null);
    setIsAnalyzing(false);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {!file && !results && (
        <DropZone dragOver={dragOver} setDragOver={setDragOver} onFile={handleFile} />
      )}

      {error && (
        <Card className="border-rose-300 bg-rose-50 dark:bg-rose-950/30">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <Button size="sm" variant="outline" onClick={reset}>Try another file</Button>
          </CardContent>
        </Card>
      )}

      <AnimatePresence mode="wait">
        {isAnalyzing && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-indigo-200 dark:border-indigo-900">
              <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 blur-xl opacity-50 animate-pulse" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  </div>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={loadingStep}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="font-medium bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent"
                    >
                      {LOADING_STEPS[loadingStep]}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-xs text-muted-foreground">
                    Analyzing 100% on your device — nothing is uploaded.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {results && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span className="truncate max-w-[180px]">{file?.name}</span>
                <span>• {results.monthsAnalyzed} months</span>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Reupload</Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Total Deposits"
                value={formatINR(results.totalDeposits)}
                icon={<TrendingUp className="h-4 w-4" />}
                tone="green"
              />
              <MetricCard
                label="Total Withdrawals"
                value={formatINR(results.totalWithdrawals)}
                icon={<TrendingDown className="h-4 w-4" />}
                tone="red"
              />
              <MetricCard
                label="Net Savings"
                value={formatINR(results.netSavings)}
                icon={<Wallet className="h-4 w-4" />}
                tone="indigo"
              />
              <MetricCard
                label="Avg Balance"
                value={formatINR(results.avgBalance)}
                icon={<ShieldCheck className="h-4 w-4" />}
                tone="blue"
              />
            </div>

            <RiskAssessment results={results} isPremium={isPremiumUser} onUpgrade={() => setIsPremiumUser(true)} />

            {isPremiumUser && (
              <Button variant="outline" size="sm" onClick={() => setIsPremiumUser(false)} className="w-full">
                (Demo) Switch to Free View
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropZone({
  dragOver, setDragOver, onFile,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFile: (f: File) => void;
}) {
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        'block cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
        'bg-gradient-to-br from-indigo-50 via-white to-blue-50',
        'dark:from-indigo-950/40 dark:via-background dark:to-blue-950/40',
        dragOver
          ? 'border-indigo-500 scale-[1.01] shadow-lg'
          : 'border-indigo-200 dark:border-indigo-900 hover:border-indigo-400',
      )}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
        <Upload className="h-7 w-7 text-white" />
      </div>
      <h3 className="font-semibold text-lg">Upload Bank Statement</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Drag & drop your PDF here, or tap to browse
      </p>
      <p className="text-xs text-muted-foreground/80 mt-3">
        Last 6 months • PDF only • Processed on-device
      </p>
    </label>
  );
}

function MetricCard({
  label, value, icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'green' | 'red' | 'indigo' | 'blue';
}) {
  const tones: Record<string, string> = {
    green: 'from-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-400',
    red: 'from-rose-500/10 to-rose-500/0 text-rose-600 dark:text-rose-400',
    indigo: 'from-indigo-500/10 to-indigo-500/0 text-indigo-600 dark:text-indigo-400',
    blue: 'from-blue-500/10 to-blue-500/0 text-blue-600 dark:text-blue-400',
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className={cn('p-4 bg-gradient-to-br', tones[tone])}>
        <div className="flex items-center gap-2 text-xs font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <p className="text-lg font-bold mt-2 text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function RiskAssessment({
  results, isPremium, onUpgrade,
}: {
  results: AnalysisResults;
  isPremium: boolean;
  onUpgrade: () => void;
}) {
  const rules: { key: string; data: RuleResult }[] = [
    { key: 'A. Sudden Inflow', data: results.ruleA },
    { key: 'B. Minimum Liquidity', data: results.ruleB },
    { key: 'C. Salary Validator', data: results.ruleC },
    { key: 'D. Savings Ratio', data: results.ruleD },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h3 className="font-semibold">Visa Officer Risk Assessment</h3>
      </div>

      <div className="relative">
        <div className={cn('space-y-3 transition-all', !isPremium && 'blur-md pointer-events-none select-none')}>
          {rules.map((r) => (
            <RuleCard key={r.key} label={r.key} result={r.data} />
          ))}
        </div>

        {!isPremium && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 flex items-center justify-center p-4"
          >
            <div className="w-full rounded-2xl p-6 text-center text-white shadow-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 border border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-3">
                <Lock className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-lg">Unlock Full Visa Officer Assessment</h4>
              <p className="text-sm text-white/80 mt-1">
                See exactly why your statement may be flagged — and how to fix it before applying.
              </p>
              <Button
                onClick={onUpgrade}
                className="mt-4 bg-white text-indigo-700 hover:bg-white/90 font-semibold"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Upgrade Now
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function RuleCard({ label, result }: { label: string; result: RuleResult }) {
  const map = {
    pass: {
      icon: <CheckCircle2 className="h-5 w-5" />,
      cls: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300',
    },
    warning: {
      icon: <AlertTriangle className="h-5 w-5" />,
      cls: 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 text-amber-700 dark:text-amber-300',
    },
    critical: {
      icon: <XCircle className="h-5 w-5" />,
      cls: 'border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 text-rose-700 dark:text-rose-300',
    },
    info: {
      icon: <FileText className="h-5 w-5" />,
      cls: 'border-slate-200 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300',
    },
  } as const;
  const m = map[result.status];
  return (
    <div className={cn('rounded-xl border p-4', m.cls)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{m.icon}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/30">
              {result.status}
            </span>
          </div>
          <p className="font-semibold mt-1 text-foreground">{result.title}</p>
          <p className="text-sm mt-1 text-foreground/80">{result.message}</p>
          {result.detail && (
            <p className="text-xs mt-2 text-foreground/60">{result.detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default BankStatementAnalyzer;