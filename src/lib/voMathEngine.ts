// Visa Officer math engine — purely client-side, deterministic.

export interface RawTxn {
  date: Date;
  description: string;
  withdrawal: number;
  deposit: number;
  balance: number;
}

export type FlagLevel = 'red' | 'yellow' | 'green';

export interface VOFlag {
  id: string;
  level: FlagLevel;
  title: string;
  detail: string;
}

export interface VOResult {
  flags: VOFlag[];
  avgMonthlyInflow: number;
  avgMonthlyOutflow: number;
  avgBalance: number;
  monthsCovered: number;
  largestDeposit: { amount: number; date: Date | null; description: string };
  totalDeposits: number;
  totalWithdrawals: number;
  debitsPerMonth: number;
  hasEconomicTies: boolean;
  economicTiesKeywords: string[];
  incomeProfile: 'salaried' | 'business' | 'irregular';
  accountType: AccountType;
}

export type AccountType = 'personal' | 'company' | 'sponsor';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function runVORules(
  txns: RawTxn[],
  estimatedTripCost: number,
  employmentType: string = 'Salaried',
  accountType: AccountType = 'personal',
): VOResult {
  const flags: VOFlag[] = [];
  if (!txns.length) {
    return {
      flags: [{ id: 'no-data', level: 'red', title: 'No transactions detected', detail: 'We could not extract any rows from this statement.' }],
      avgMonthlyInflow: 0, avgMonthlyOutflow: 0, avgBalance: 0, monthsCovered: 0,
      largestDeposit: { amount: 0, date: null, description: '' },
      totalDeposits: 0, totalWithdrawals: 0, debitsPerMonth: 0,
      hasEconomicTies: false, economicTiesKeywords: [], incomeProfile: 'irregular',
      accountType,
    };
  }

  const byMonth = new Map<string, { in: number; out: number; debits: number; balances: number[] }>();
  for (const t of txns) {
    const k = monthKey(t.date);
    const m = byMonth.get(k) || { in: 0, out: 0, debits: 0, balances: [] };
    m.in += t.deposit;
    m.out += t.withdrawal;
    if (t.withdrawal > 0) m.debits += 1;
    if (t.balance) m.balances.push(t.balance);
    byMonth.set(k, m);
  }

  const months = Array.from(byMonth.values());
  const monthsCovered = months.length;
  const totalIn = months.reduce((s, m) => s + m.in, 0);
  const totalOut = months.reduce((s, m) => s + m.out, 0);
  const avgMonthlyInflow = totalIn / Math.max(monthsCovered, 1);
  const avgMonthlyOutflow = totalOut / Math.max(monthsCovered, 1);
  const allBalances = txns.map(t => t.balance).filter(b => b > 0);
  const avgBalance = allBalances.reduce((s, b) => s + b, 0) / Math.max(allBalances.length, 1);
  const debitsPerMonth = months.reduce((s, m) => s + m.debits, 0) / Math.max(monthsCovered, 1);

  // Largest single deposit
  const largest = txns.reduce<RawTxn | null>((acc, t) => (!acc || t.deposit > acc.deposit ? t : acc), null);
  const largestDeposit = largest
    ? { amount: largest.deposit, date: largest.date, description: largest.description }
    : { amount: 0, date: null, description: '' };

  // Rule 1 — Fund Parking
  if (avgMonthlyInflow > 0 && largestDeposit.amount > 3 * avgMonthlyInflow) {
    flags.push({
      id: 'fund-parking',
      level: 'red',
      title: 'Potential Fund Parking Detected',
      detail: `A single deposit of ₹${Math.round(largestDeposit.amount).toLocaleString('en-IN')} is more than 3× your average monthly inflow (₹${Math.round(avgMonthlyInflow).toLocaleString('en-IN')}). Visa officers may treat this as borrowed/parked funds.`,
    });
  }

  // Rule 2 — Economic Ties (skip entirely for Company / Current account)
  const tiesRegex = /\b(EMI|SIP|Mutual Fund|LIC|Insurance|PPF|Loan)\b/ig;
  const rawMatches: string[] = [];
  if (accountType !== 'company') {
    for (const t of txns) {
      if (t.withdrawal <= 0) continue;
      let m: RegExpExecArray | null;
      while ((m = tiesRegex.exec(t.description)) !== null) {
        rawMatches.push(m[1]);
      }
    }
  }
  const canonicalMap: Record<string, string> = {
    emi: 'EMI', sip: 'SIP', 'mutual fund': 'Mutual Fund', lic: 'LIC',
    insurance: 'Insurance', ppf: 'PPF', loan: 'Loan',
  };
  const economicTiesKeywords = Array.from(
    new Set(rawMatches.map(w => canonicalMap[w.toLowerCase()] || w))
  );
  const hasEconomicTies = economicTiesKeywords.length > 0;

  if (accountType !== 'company') {
    if (hasEconomicTies) {
      const joined = economicTiesKeywords.join(', ');
      flags.push({
        id: 'economic-ties',
        level: 'green',
        title: 'Strong Economic Ties to India',
        detail: `Recurring commitments (${joined}) found. This signals strong intent to return home.`,
      });
    } else {
      flags.push({
        id: 'no-economic-ties',
        level: 'yellow',
        title: 'No Recurring Financial Commitments',
        detail: 'We could not find EMI / SIP / LIC / Insurance / Loan entries. Adding such ties strengthens your return-intent profile.',
      });
    }
  }

  // Rule 3 — Ghost Account
  if (accountType !== 'company' && debitsPerMonth < 10) {
    flags.push({
      id: 'ghost-account',
      level: 'yellow',
      title: 'Low Account Activity (Ghost Account Risk)',
      detail: `Only ${debitsPerMonth.toFixed(1)} debits/month on average. Visa officers expect an actively used primary account (10+ debits/month).`,
    });
  }

  // Rule 4 — Affordability
  if (accountType === 'company') {
    // Business Liquidity: avg balance > tripCost * 2
    if (estimatedTripCost > 0) {
      if (avgBalance >= estimatedTripCost * 2) {
        flags.push({
          id: 'business-liquidity',
          level: 'green',
          title: 'Strong Business Liquidity',
          detail: `Average balance ₹${Math.round(avgBalance).toLocaleString('en-IN')} comfortably exceeds 2× the estimated trip cost (₹${Math.round(estimatedTripCost * 2).toLocaleString('en-IN')}).`,
        });
      } else {
        flags.push({
          id: 'business-liquidity-weak',
          level: 'yellow',
          title: 'Limited Business Liquidity',
          detail: `Average balance ₹${Math.round(avgBalance).toLocaleString('en-IN')} is below 2× the estimated trip cost (₹${Math.round(estimatedTripCost * 2).toLocaleString('en-IN')}). Consider supplementing with FDs or directors' personal funds.`,
        });
      }
    }
  } else if (estimatedTripCost > 0 && avgBalance < estimatedTripCost) {
    flags.push({
      id: 'affordability',
      level: 'yellow',
      title: 'Affordability Concern',
      detail: `6-month average balance ₹${Math.round(avgBalance).toLocaleString('en-IN')} is below estimated trip cost ₹${Math.round(estimatedTripCost).toLocaleString('en-IN')}.`,
    });
  }

  // Rule 5 — Income / Cashflow Validator
  let incomeProfile: VOResult['incomeProfile'] = 'irregular';
  const isBusiness = accountType === 'company' || /self.?business|self.?employed|business/i.test(employmentType);

  if (accountType === 'company') {
    // Business Operations: high txn volume
    if (debitsPerMonth > 15 && avgMonthlyInflow > 0) {
      incomeProfile = 'business';
      flags.push({
        id: 'business-operations',
        level: 'green',
        title: 'Healthy Business Operations',
        detail: 'High transaction volume indicates a genuine, active business.',
      });
    } else {
      flags.push({
        id: 'business-operations-weak',
        level: 'yellow',
        title: 'Low Business Activity',
        detail: `Only ${debitsPerMonth.toFixed(1)} debits/month detected. Visa officers expect 15+ monthly debits on an active company current account — attach GST returns / invoices to support.`,
      });
    }
  } else if (isBusiness) {
    const txnsPerMonthOk = debitsPerMonth >= 5;
    const inflowOk = avgMonthlyInflow >= 50000;
    if (txnsPerMonthOk && inflowOk) {
      incomeProfile = 'business';
      flags.push({
        id: 'income-business',
        level: 'green',
        title: 'Healthy Business Cashflow Detected',
        detail: 'Consistent transaction volume and healthy monthly inflow strongly support your business profile.',
      });
    } else {
      flags.push({
        id: 'income-business-weak',
        level: 'yellow',
        title: 'Weak Business Cashflow Pattern',
        detail: `Avg monthly inflow ₹${Math.round(avgMonthlyInflow).toLocaleString('en-IN')} with ${debitsPerMonth.toFixed(1)} debits/month. Visa officers expect steady turnover for self-employed applicants — attach GST returns or firm bank statements.`,
      });
    }
  } else {
    const monthlyDeposits = Array.from(byMonth.values()).map(m => m.in).filter(v => v > 0);
    if (monthlyDeposits.length >= 3) {
      const meanIn = monthlyDeposits.reduce((s, v) => s + v, 0) / monthlyDeposits.length;
      const within = monthlyDeposits.filter(v => Math.abs(v - meanIn) / meanIn <= 0.25).length;
      if (within / monthlyDeposits.length >= 0.7) incomeProfile = 'salaried';
    }
    if (incomeProfile === 'salaried') {
      flags.push({
        id: 'income-salaried',
        level: 'green',
        title: 'Consistent Salary Pattern Detected',
        detail: 'Regular monthly credits of similar amount strongly support salaried income claims.',
      });
    } else {
      flags.push({
        id: 'income-irregular',
        level: 'yellow',
        title: 'Irregular Salary Pattern',
        detail: 'No clear recurring monthly salary credits detected. Add a salary slip or employer letter to support your claim.',
      });
    }
  }

  return {
    flags,
    avgMonthlyInflow, avgMonthlyOutflow, avgBalance, monthsCovered,
    largestDeposit, totalDeposits: totalIn, totalWithdrawals: totalOut,
    debitsPerMonth, hasEconomicTies, economicTiesKeywords, incomeProfile,
    accountType,
  };
}

// ---- Excel parsing ----

type ColMap = { date?: number; desc?: number; withdrawal?: number; deposit?: number; balance?: number };

const PATTERNS = {
  date: /transaction date|txn date|value date|^date/i,
  desc: /narration|description|particulars|remarks|details/i,
  withdrawal: /withdrawal|debit|^dr$|\bdr\b|out/i,
  deposit: /deposit|credit|^cr$|\bcr\b|^in$/i,
  balance: /balance/i,
};

function findHeaderRow(rows: any[][]): { row: number; cols: ColMap } | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i] || [];
    const cols: ColMap = {};
    row.forEach((cell, idx) => {
      const text = String(cell ?? '').trim();
      if (!text) return;
      if (cols.date === undefined && PATTERNS.date.test(text)) cols.date = idx;
      else if (cols.desc === undefined && PATTERNS.desc.test(text)) cols.desc = idx;
      else if (cols.withdrawal === undefined && PATTERNS.withdrawal.test(text)) cols.withdrawal = idx;
      else if (cols.deposit === undefined && PATTERNS.deposit.test(text)) cols.deposit = idx;
      else if (cols.balance === undefined && PATTERNS.balance.test(text)) cols.balance = idx;
    });
    if (cols.date !== undefined && cols.desc !== undefined && cols.balance !== undefined) {
      return { row: i, cols };
    }
  }
  return null;
}

function parseNumber(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₹,\s]/g, '').replace(/(cr|dr)$/i, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseDate(v: any): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

export function parseStatementFromAOA(rows: any[][]): RawTxn[] {
  const header = findHeaderRow(rows);
  if (!header) throw new Error('Could not detect a header row with Date, Description and Balance columns.');
  const { cols } = header;
  const out: RawTxn[] = [];
  for (let i = header.row + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const date = parseDate(row[cols.date!]);
    const desc = String(row[cols.desc!] ?? '').trim();
    const balance = parseNumber(row[cols.balance!]);
    if (!date || !desc || balance === 0) continue;
    const withdrawal = cols.withdrawal !== undefined ? parseNumber(row[cols.withdrawal]) : 0;
    const deposit = cols.deposit !== undefined ? parseNumber(row[cols.deposit]) : 0;
    if (withdrawal === 0 && deposit === 0) continue;
    out.push({ date, description: desc, withdrawal, deposit, balance });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}