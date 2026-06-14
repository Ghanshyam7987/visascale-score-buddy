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

/** Generate 6 months of realistic dummy transactions. */
export function simulatePDFExtraction(_file: File): Promise<Transaction[]> {
  return new Promise((resolve) => {
    const txns: Transaction[] = [];
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - 6);
    start.setDate(1);

    let balance = 180000;
    const salaryAmount = 85000;
    const merchants = [
      'AMAZON RETAIL', 'SWIGGY ORDER', 'ZOMATO', 'UBER INDIA', 'BIG BAZAAR',
      'ELECTRICITY BILL', 'MOBILE RECHARGE', 'NETFLIX SUBSCRIPTION',
      'PETROL PUMP HP', 'DMART GROCERIES', 'IRCTC TRAIN', 'MAKEMYTRIP',
    ];

    const cursor = new Date(start);
    while (cursor <= today) {
      const day = cursor.getDate();
      const month = cursor.getMonth();
      const year = cursor.getFullYear();

      // Salary credit between 1st-7th
      if (day === 2 + (month % 4)) {
        const variance = (Math.random() - 0.5) * 0.06 * salaryAmount;
        const amt = Math.round(salaryAmount + variance);
        balance += amt;
        txns.push({
          date: new Date(year, month, day),
          description: 'NEFT SALARY CR ACME CORP',
          deposit: amt,
          withdrawal: 0,
          balance,
        });
      }

      // 1-3 random spends per day
      const spendCount = Math.floor(Math.random() * 3);
      for (let s = 0; s < spendCount; s++) {
        const amt = Math.round(200 + Math.random() * 4500);
        balance -= amt;
        txns.push({
          date: new Date(year, month, day),
          description: merchants[Math.floor(Math.random() * merchants.length)],
          deposit: 0,
          withdrawal: amt,
          balance,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    // Inject a suspicious large deposit in last 20 days (to demo Rule A)
    const suspicious = new Date(today);
    suspicious.setDate(suspicious.getDate() - 12);
    const bigAmt = 650000;
    balance += bigAmt;
    txns.push({
      date: suspicious,
      description: 'IMPS TRANSFER CR - SELF',
      deposit: bigAmt,
      withdrawal: 0,
      balance,
    });

    txns.sort((a, b) => a.date.getTime() - b.date.getTime());
    // Recompute balances cleanly
    let run = 180000;
    for (const t of txns) {
      run += t.deposit - t.withdrawal;
      t.balance = run;
    }

    setTimeout(() => resolve(txns), 600);
  });
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