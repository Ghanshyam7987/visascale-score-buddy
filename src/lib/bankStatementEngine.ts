export interface Transaction {
  date: Date;
  description: string;
  deposit: number;
  withdrawal: number;
  balance: number;
}

export interface RuleResult {
  status: 'pass' | 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  detail?: string;
}

export interface AnalysisResults {
  totalDeposits: number;
  totalWithdrawals: number;
  netSavings: number;
  avgBalance: number;
  monthsAnalyzed: number;
  ruleA: RuleResult;
  ruleB: RuleResult;
  ruleC: RuleResult;
  ruleD: RuleResult & { avgRetentionPct: number };
}

/** Real on-device PDF parser for Indian bank statements (SBI/HDFC/ICICI/Axis/Kotak etc). */
export async function extractTransactionsFromPDF(file: File): Promise<Transaction[]> {
  // Lazy-load pdfjs (main entry resolves to build/pdf.mjs)
  const pdfjsLib: any = await import('pdfjs-dist');
  // Load the worker as a Vite URL so it's bundled & served by the dev server
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  // Build line-grouped text per page using y-coordinates
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: item.transform[4], str: item.str });
    }
    const sortedYs = Array.from(rows.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const line = rows.get(y)!
        .sort((a, b) => a.x - b.x)
        .map((s) => s.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) lines.push(line);
    }
  }

  return parseTransactionLines(lines);
}

/** Parses lines from any common Indian bank statement format. */
function parseTransactionLines(lines: string[]): Transaction[] {
  const txns: Transaction[] = [];
  // Date formats: 01/04/2024, 01-04-2024, 01 Apr 2024, 01-Apr-2024, 01-Apr-24
  const dateRe =
    /(\b\d{1,2}[\/\-\s](?:\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\/\-\s]\d{2,4}\b)/i;
  // Number with optional commas and decimals, optional Dr/Cr suffix
  const numRe = /([\d,]+\.\d{2})(?:\s*(Dr|Cr))?/gi;

  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    const dm = line.match(dateRe);
    if (!dm) continue;
    const date = parseDate(dm[1]);
    if (!date) continue;

    // Extract all monetary numbers
    const nums: { val: number; suffix?: string; idx: number }[] = [];
    let m: RegExpExecArray | null;
    numRe.lastIndex = 0;
    while ((m = numRe.exec(line)) !== null) {
      nums.push({ val: parseFloat(m[1].replace(/,/g, '')), suffix: m[2], idx: m.index });
    }
    if (nums.length < 2) continue; // need at least amount + balance

    // Description = between date and first number
    const firstNumIdx = nums[0].idx;
    const afterDateIdx = (dm.index ?? 0) + dm[1].length;
    let description = line.slice(afterDateIdx, firstNumIdx).trim();
    description = description.replace(/^[\-\|\s]+|[\-\|\s]+$/g, '');
    if (!description) description = '—';

    // Last number = balance. Previous numbers = amount(s).
    const balance = nums[nums.length - 1].val;
    let deposit = 0;
    let withdrawal = 0;

    if (nums.length >= 3) {
      // [withdrawal, deposit, balance] OR [deposit, withdrawal, balance] — Indian statements vary.
      // Most common: Withdrawal | Deposit | Balance. A zero/blank column shows as missing.
      // Since we matched only non-zero amounts, treat: if 3 nums → first=wd, second=dep
      withdrawal = nums[0].val;
      deposit = nums[1].val;
    } else {
      // 2 numbers: amount + balance. Use Dr/Cr suffix, or infer from previous balance.
      const amt = nums[0];
      if (amt.suffix?.toLowerCase() === 'cr') {
        deposit = amt.val;
      } else if (amt.suffix?.toLowerCase() === 'dr') {
        withdrawal = amt.val;
      } else if (txns.length > 0) {
        const prevBal = txns[txns.length - 1].balance;
        if (balance > prevBal) deposit = amt.val;
        else withdrawal = amt.val;
      } else {
        // First row, no signal — assume withdrawal
        withdrawal = amt.val;
      }
    }

    txns.push({ date, description, deposit, withdrawal, balance });
  }

  // Sort chronologically
  txns.sort((a, b) => a.date.getTime() - b.date.getTime());
  return txns;
}

function parseDate(s: string): Date | null {
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const parts = s.split(/[\/\-\s]+/);
  if (parts.length !== 3) return null;
  let [d, mo, y] = parts;
  let day = parseInt(d, 10);
  let month: number;
  const moLower = mo.toLowerCase();
  if (months[moLower] !== undefined) month = months[moLower];
  else month = parseInt(mo, 10) - 1;
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year) || month < 0 || month > 11) return null;
  const dt = new Date(year, month, day);
  return isNaN(dt.getTime()) ? null : dt;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Rule A: Sudden Inflow Flag */
function ruleA(txns: Transaction[]): RuleResult {
  if (txns.length === 0) return { status: 'info', title: 'Sudden Inflow Check', message: 'No data' };
  const last = txns[txns.length - 1].date;
  const cutoff = new Date(last);
  cutoff.setDate(cutoff.getDate() - 30);

  // Daily closing balance for first 5 months window (before cutoff)
  const dailyBalances = new Map<string, number>();
  for (const t of txns) {
    if (t.date < cutoff) {
      dailyBalances.set(t.date.toDateString(), t.balance);
    }
  }
  const balances = Array.from(dailyBalances.values());
  const avg = balances.reduce((a, b) => a + b, 0) / Math.max(balances.length, 1);

  const recentDeposits = txns.filter((t) => t.date >= cutoff && t.deposit > 0);
  const flagged = recentDeposits.find((t) => t.deposit > 2.5 * avg);

  if (flagged) {
    return {
      status: 'warning',
      title: 'Sudden Inflow Detected',
      message: `Large deposit of ₹${flagged.deposit.toLocaleString('en-IN')} flagged.`,
      detail: `Avg daily balance was ₹${Math.round(avg).toLocaleString('en-IN')}. Visa officers may consider this funds parking. Maintain this balance for 3+ months.`,
    };
  }
  return {
    status: 'pass',
    title: 'No Sudden Inflows',
    message: 'Cash flow looks organic and consistent.',
    detail: `Avg daily balance: ₹${Math.round(avg).toLocaleString('en-IN')}.`,
  };
}

/** Rule B: Minimum Liquidity */
function ruleB(txns: Transaction[], tripCost: number): RuleResult {
  const breach = txns.find((t) => t.balance < tripCost);
  if (breach) {
    return {
      status: 'critical',
      title: 'Liquidity Below Trip Cost',
      message: `Balance dropped to ₹${Math.round(breach.balance).toLocaleString('en-IN')} on ${breach.date.toLocaleDateString('en-IN')}.`,
      detail: `Required minimum: ₹${tripCost.toLocaleString('en-IN')}. Keep balance consistently above trip cost for at least 3 months before applying.`,
    };
  }
  return {
    status: 'pass',
    title: 'Liquidity Maintained',
    message: `Balance stayed above ₹${tripCost.toLocaleString('en-IN')} throughout.`,
  };
}

/** Rule C: Salary Validator */
function ruleC(txns: Transaction[]): RuleResult {
  const re = /salary|neft|imps/i;
  const candidates = txns.filter(
    (t) => t.deposit > 0 && re.test(t.description) && t.date.getDate() >= 1 && t.date.getDate() <= 10,
  );
  const byMonth = new Map<string, Transaction[]>();
  for (const t of candidates) {
    const k = monthKey(t.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(t);
  }
  const months = Array.from(byMonth.values()).map((arr) => arr.sort((a, b) => b.deposit - a.deposit)[0]);
  if (months.length < 3) {
    return {
      status: 'warning',
      title: 'Inconsistent Salary Pattern',
      message: 'Less than 3 months show salary-like credits between 1st–10th.',
    };
  }
  const avg = months.reduce((a, b) => a + b.deposit, 0) / months.length;
  const allInRange = months.every((t) => Math.abs(t.deposit - avg) <= 0.1 * avg);
  if (allInRange) {
    return {
      status: 'pass',
      title: 'Stable Salary Detected',
      message: `Consistent monthly credit of ~₹${Math.round(avg).toLocaleString('en-IN')} across ${months.length} months.`,
    };
  }
  return {
    status: 'warning',
    title: 'Variable Salary Credits',
    message: 'Monthly credits vary by more than 10%.',
    detail: 'Visa officers prefer salary slips matching consistent bank credits.',
  };
}

/** Rule D: Savings Ratio */
function ruleD(txns: Transaction[]): RuleResult & { avgRetentionPct: number } {
  const byMonth = new Map<string, { dep: number; wd: number }>();
  for (const t of txns) {
    const k = monthKey(t.date);
    const cur = byMonth.get(k) || { dep: 0, wd: 0 };
    cur.dep += t.deposit;
    cur.wd += t.withdrawal;
    byMonth.set(k, cur);
  }
  const ratios: number[] = [];
  byMonth.forEach((v) => {
    if (v.dep > 0) ratios.push(((v.dep - v.wd) / v.dep) * 100);
  });
  const avg = ratios.reduce((a, b) => a + b, 0) / Math.max(ratios.length, 1);
  const status = avg >= 30 ? 'pass' : avg >= 10 ? 'warning' : 'critical';
  return {
    status,
    title: 'Savings Retention',
    message: `Average monthly retention: ${avg.toFixed(1)}%`,
    detail:
      avg >= 30
        ? 'Excellent. Strong financial discipline visible.'
        : avg >= 10
          ? 'Moderate. Try to retain at least 30% of monthly inflows.'
          : 'Low retention. Withdrawals nearly match deposits — a red flag for visa officers.',
    avgRetentionPct: avg,
  };
}

export function runVisaMathEngine(txns: Transaction[], tripCost = 250000): AnalysisResults {
  const totalDeposits = txns.reduce((s, t) => s + t.deposit, 0);
  const totalWithdrawals = txns.reduce((s, t) => s + t.withdrawal, 0);
  const avgBalance = txns.reduce((s, t) => s + t.balance, 0) / Math.max(txns.length, 1);
  const months = new Set(txns.map((t) => monthKey(t.date))).size;

  return {
    totalDeposits,
    totalWithdrawals,
    netSavings: totalDeposits - totalWithdrawals,
    avgBalance,
    monthsAnalyzed: months,
    ruleA: ruleA(txns),
    ruleB: ruleB(txns, tripCost),
    ruleC: ruleC(txns),
    ruleD: ruleD(txns),
  };
}