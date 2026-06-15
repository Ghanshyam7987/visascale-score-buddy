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

type ParsedTransaction = Transaction & {
  sourceIndex: number;
  amountCandidates: MoneyToken[];
  rawText: string;
};

type MoneyToken = { val: number; suffix?: string; idx: number; raw: string; x?: number };
type TextRow = { page: number; y: number; text: string; items: { x: number; str: string }[] };

const DATE_RE = /(\b\d{1,2}[\/\-\s](?:\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\/\-\s]\d{2,4}\b)/i;
const DATE_RE_GLOBAL = new RegExp(DATE_RE.source, 'gi');

/** Real on-device PDF parser for Indian bank statements (SBI/HDFC/ICICI/Axis/Kotak etc). */
export async function extractTransactionsFromPDF(file: File): Promise<Transaction[]> {
  const pdfjsLib: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const rowsByPage: TextRow[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];

    for (const item of content.items as any[]) {
      if (!item.str?.trim() || !item.transform) continue;
      const y = item.transform[5];
      const existing = rows.find((row) => Math.abs(row.y - y) <= 2);
      const target = existing || { y, items: [] };
      target.items.push({ x: item.transform[4], str: item.str });
      if (!existing) rows.push(target);
    }

    rows
      .sort((a, b) => b.y - a.y)
      .forEach((row) => {
        const orderedItems = row.items.sort((a, b) => a.x - b.x);
        const line = orderedItems
          .sort((a, b) => a.x - b.x)
          .map((s) => s.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) rowsByPage.push({ page: p, y: row.y, text: line, items: orderedItems });
      });
  }

  return parseRows(rowsByPage);
}

/** Parses lines from common Indian bank PDF statements and reconciles debit/credit from balance movement. */
function parseTransactionLines(lines: string[]): Transaction[] {
  return finalizeTransactions(buildLogicalRowsFromLines(lines));
}

function parseRows(rows: TextRow[]): Transaction[] {
  const logicalRows = buildLogicalRows(rows);
  const columns = inferColumns(logicalRows);
  const parsed = logicalRows
    .map((row, index) => parseLogicalRow(row.text, index, extractMoneyFromRow(row), columns))
    .filter((txn): txn is ParsedTransaction => Boolean(txn));

  if (parsed.length > 0) return finalizeTransactions(parsed);

  return parseTransactionLines(rows.map((row) => row.text));
}

function buildLogicalRows(rows: TextRow[]): TextRow[] {
  const logicalRows: TextRow[] = [];
  let current: TextRow | null = null;

  for (const row of rows) {
    const parts = splitByTransactionDate(normalizeLine(row.text));
    for (const text of parts) {
    if (!text || isNoiseLine(text)) continue;

    if (DATE_RE.test(text)) {
      if (current) logicalRows.push(current);
      current = { ...row, text };
      continue;
    }

    if (current && shouldAppendContinuation(text)) {
      current = {
        ...current,
        text: `${current.text} ${text}`.replace(/\s+/g, ' ').trim(),
        items: [...current.items, ...row.items],
      };
    }
    }
  }

  if (current) logicalRows.push(current);
  return logicalRows;
}

function buildLogicalRowsFromLines(lines: string[]): ParsedTransaction[] {
  const logicalRows: string[] = [];
  let current = '';

  for (const raw of lines) {
    const parts = splitByTransactionDate(normalizeLine(raw));
    for (const text of parts) {
    if (!text || isNoiseLine(text)) continue;

    if (DATE_RE.test(text)) {
      if (current) logicalRows.push(current);
      current = text;
    } else if (current && shouldAppendContinuation(text)) {
      current = `${current} ${text}`.replace(/\s+/g, ' ').trim();
    }
    }
  }

  if (current) logicalRows.push(current);
  return logicalRows
    .map((line, index) => parseLogicalRow(line, index, extractMoney(line)))
    .filter((txn): txn is ParsedTransaction => Boolean(txn));
}

function splitByTransactionDate(line: string) {
  const matches = Array.from(line.matchAll(DATE_RE_GLOBAL));
  if (matches.length <= 1) return [line];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? line.length;
    return line.slice(start, end).trim();
  });
}

function parseLogicalRow(
  line: string,
  sourceIndex: number,
  nums: MoneyToken[],
  columns?: { debitX?: number; creditX?: number; balanceX?: number },
): ParsedTransaction | null {
  const dm = line.match(DATE_RE);
  if (!dm) return null;

  const date = parseDate(dm[1]);
  if (!date) return null;

  const afterDateIdx = (dm.index ?? 0) + dm[1].length;
  const relevantNums = nums.filter((n) => n.idx >= afterDateIdx && n.val > 0);
  if (relevantNums.length < 2) return null;

  const balanceToken = pickBalanceToken(relevantNums, columns?.balanceX);
  const amountCandidates = relevantNums.filter((n) => n !== balanceToken);
  if (amountCandidates.length === 0) return null;

  const firstAmountIdx = Math.min(...relevantNums.map((n) => n.idx));
  let description = line.slice(afterDateIdx, firstAmountIdx).trim();
  description = description.replace(/^[\-\|:\s]+|[\-\|:\s]+$/g, '');
  if (!description) description = '—';

  const txn: ParsedTransaction = {
    date,
    description,
    deposit: 0,
    withdrawal: 0,
    balance: balanceToken.val,
    sourceIndex,
    amountCandidates,
    rawText: line,
  };

  applyColumnAmounts(txn, columns);
  return txn;
}

function finalizeTransactions(parsed: ParsedTransaction[]): Transaction[] {
  return reconcileTransactions(parsed)
    .map(({ sourceIndex, amountCandidates, rawText, ...txn }) => txn)
    .filter((txn) => txn.deposit > 0 || txn.withdrawal > 0 || txn.balance > 0);
}

function isNoiseLine(line: string) {
  return /^(date|txn date|transaction date|particulars|description|narration|remarks|debit|withdrawal|credit|deposit|balance|page\b|statement|account|ifsc|branch|opening balance|closing balance|total\b)/i.test(line)
    || /generated on|computer generated|end of statement|this is a system generated/i.test(line);
}

function shouldAppendContinuation(line: string) {
  return !isNoiseLine(line) && !/^\d+\s*$/.test(line);
}

function extractMoneyFromRow(row: TextRow): MoneyToken[] {
  const tokens: MoneyToken[] = [];
  let offset = 0;
  for (const item of row.items.sort((a, b) => a.x - b.x)) {
    const text = normalizeLine(item.str);
    for (const token of extractMoney(text)) {
      tokens.push({ ...token, idx: offset + token.idx, x: item.x });
    }
    offset += text.length + 1;
  }
  return tokens.length >= 2 ? tokens : extractMoney(row.text);
}

function inferColumns(rows: TextRow[]) {
  const samples = rows.map((row) => extractMoneyFromRow(row)).filter((nums) => nums.length >= 2);
  const balanceXs = samples.map((nums) => nums.reduce((right, cur) => ((cur.x ?? 0) > (right.x ?? 0) ? cur : right)).x).filter(isNumber);
  const balanceX = median(balanceXs);
  const debitXs: number[] = [];
  const creditXs: number[] = [];
  const rough = rows
    .map((row, index) => parseLogicalRow(row.text, index, extractMoneyFromRow(row), { balanceX }))
    .filter((txn): txn is ParsedTransaction => Boolean(txn))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.sourceIndex - b.sourceIndex);

  for (let i = 1; i < rough.length; i++) {
    const delta = roundMoney(rough[i].balance - rough[i - 1].balance);
    const expected = Math.abs(delta);
    if (expected <= 0) continue;
    const candidate = closestAmount(rough[i].amountCandidates, expected);
    if (!candidate || !isNumber(candidate.x) || Math.abs(candidate.val - expected) > Math.max(1, expected * 0.02)) continue;
    if (delta > 0) creditXs.push(candidate.x);
    else debitXs.push(candidate.x);
  }

  return { debitX: median(debitXs), creditX: median(creditXs), balanceX };
}

function pickBalanceToken(nums: MoneyToken[], balanceX?: number) {
  if (isNumber(balanceX)) {
    return nums.reduce((best, cur) => (
      Math.abs((cur.x ?? balanceX) - balanceX) < Math.abs((best.x ?? balanceX) - balanceX) ? cur : best
    ), nums[nums.length - 1]);
  }
  return nums.reduce((right, cur) => ((cur.x ?? cur.idx) > (right.x ?? right.idx) ? cur : right), nums[nums.length - 1]);
}

function applyColumnAmounts(txn: ParsedTransaction, columns?: { debitX?: number; creditX?: number }) {
  if (!columns) return;
  const debit = isNumber(columns.debitX) ? nearestByX(txn.amountCandidates, columns.debitX) : undefined;
  const credit = isNumber(columns.creditX) ? nearestByX(txn.amountCandidates, columns.creditX) : undefined;
  if (credit && (!debit || credit !== debit)) txn.deposit = credit.val;
  else if (debit) txn.withdrawal = debit.val;
}

function isNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function median(values: number[]) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  return sorted[Math.floor(sorted.length / 2)];
}

function closestAmount(tokens: MoneyToken[], expected: number) {
  if (tokens.length === 0) return undefined;
  return tokens.reduce((best, cur) => (
    Math.abs(cur.val - expected) < Math.abs(best.val - expected) ? cur : best
  ), tokens[0]);
}

function nearestByX(tokens: MoneyToken[], x: number) {
  const positioned = tokens.filter((token) => isNumber(token.x));
  if (positioned.length === 0) return undefined;
  return positioned.reduce((best, cur) => (
    Math.abs((cur.x ?? x) - x) < Math.abs((best.x ?? x) - x) ? cur : best
  ), positioned[0]);
}

function normalizeLine(s: string) {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/[₹]/g, '')
    .replace(/\b(CR|DR)\b/g, (m) => m.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMoney(line: string) {
  const moneyRe = /([+-]?\(?\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\)?|[+-]?\(?\d+\.\d{1,2}\)?)(?:\s*(Dr|Cr|dr|cr))?/g;
  const nums: { val: number; suffix?: string; idx: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  moneyRe.lastIndex = 0;

  while ((m = moneyRe.exec(line)) !== null) {
    const raw = m[1];
    const negative = raw.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
    const val = Math.abs(parseFloat(raw.replace(/[(),+]/g, '')));
    if (!Number.isFinite(val)) continue;
    nums.push({ val, suffix: negative ? 'Dr' : m[2], idx: m.index, raw: m[0] });
  }

  return nums;
}

function countMoney(line: string) {
  return extractMoney(line).length;
}

function reconcileTransactions(txns: ParsedTransaction[]): ParsedTransaction[] {
  if (txns.length === 0) return [];
  const originalDescending = txns.length > 1 && txns[0].date.getTime() > txns[txns.length - 1].date.getTime();
  const sorted = [...txns].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime();
    if (byDate !== 0) return byDate;
    return originalDescending ? b.sourceIndex - a.sourceIndex : a.sourceIndex - b.sourceIndex;
  });

  for (let i = 0; i < sorted.length; i++) {
    const txn = sorted[i];
    const bySuffix = txn.amountCandidates.find((n) => n.suffix?.toLowerCase() === 'cr')
      || txn.amountCandidates.find((n) => n.suffix?.toLowerCase() === 'dr');

    if (bySuffix) {
      if (bySuffix.suffix?.toLowerCase() === 'cr') txn.deposit = bySuffix.val;
      else txn.withdrawal = bySuffix.val;
      continue;
    }

    if (i > 0 && txn.amountCandidates.length > 0) {
      const delta = roundMoney(txn.balance - sorted[i - 1].balance);
      const expected = Math.abs(delta);
      const candidate = txn.amountCandidates.reduce((best, cur) => (
        Math.abs(cur.val - expected) < Math.abs(best.val - expected) ? cur : best
      ), txn.amountCandidates[0]);
      const tolerance = Math.max(1, expected * 0.02);

      if (expected > 0 && Math.abs(candidate.val - expected) <= tolerance) {
        if (delta > 0) txn.deposit = candidate.val;
        else txn.withdrawal = candidate.val;
        continue;
      }
    }

    const fallback = txn.amountCandidates.find((n) => n.val > 0);
    if (!fallback) continue;
    if (/salary|refund|interest|cash\s*dep|deposit|credit|by\s+/i.test(txn.description)) txn.deposit = fallback.val;
    else txn.withdrawal = fallback.val;
  }

  return sorted;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
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