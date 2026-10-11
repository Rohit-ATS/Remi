// Income assessment, computed in code.
//
// This module is the reason Remi's assistant is not a chat wrapper. Every figure
// a worker or a lender sees is produced here, deterministically, from settled
// payouts. The model's only job is to put these numbers into a sentence; it is
// never asked what someone earns or what they can borrow.
//
// Money is in integer minor units (6 decimals) throughout. Nothing here uses a
// float except the published ratios, which are presentational.

export type PayoutLike = {
  payer: string;
  payee: string;
  amount: string;
  timestamp: number;
  category: string;
  label: string;
};

export type MonthBucket = { month: string; total: string; count: number };

export type Assessment = {
  /** Integer minor units. */
  totalEarned: string;
  payoutCount: number;
  clientCount: number;
  monthsActive: number;
  monthsObserved: number;
  firstPaidAt: number | null;
  lastPaidAt: number | null;
  medianMonthly: string;
  byMonth: MonthBucket[];
  byClient: { payer: string; total: string; count: number; share: number }[];
  /** 0–100. Higher is steadier income, not higher income. */
  stabilityScore: number;
  signals: {
    /** 0–1. How even the monthly totals are. */
    regularity: number;
    /** 0–1. 1 means every dollar came from one client. */
    concentration: number;
    /** Ratio of the recent window to the one before it. 1 is flat. */
    trend: number;
    /** Share of observed months that had at least one payout. */
    coverage: number;
    /** 0–1. How much history there is to judge at all, independent of quality. */
    confidence: number;
  };
  /** Illustrative advance, integer minor units. Not an offer. */
  advanceCeiling: string;
  reasons: string[];
};

const SECOND_MS = 1000;

function monthKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * SECOND_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(aSeconds: number, bSeconds: number): number {
  const a = new Date(aSeconds * SECOND_MS);
  const b = new Date(bSeconds * SECOND_MS);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1
  );
}

function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2n;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Scores how dependable a payee's income looks, from settled payouts alone.
 *
 * `now` is injected so the result is a pure function of its inputs and the
 * tests do not drift as the clock moves.
 */
export function assess(payouts: PayoutLike[], now: number = Math.floor(Date.now() / 1000)): Assessment {
  if (payouts.length === 0) {
    return {
      totalEarned: "0",
      payoutCount: 0,
      clientCount: 0,
      monthsActive: 0,
      monthsObserved: 0,
      firstPaidAt: null,
      lastPaidAt: null,
      medianMonthly: "0",
      byMonth: [],
      byClient: [],
      stabilityScore: 0,
      signals: { regularity: 0, concentration: 0, trend: 1, coverage: 0, confidence: 0 },
      advanceCeiling: "0",
      reasons: ["No settled payouts yet, so there is nothing to assess."],
    };
  }

  const sorted = [...payouts].sort((a, b) => a.timestamp - b.timestamp);
  const firstPaidAt = sorted[0]!.timestamp;
  const lastPaidAt = sorted[sorted.length - 1]!.timestamp;

  let totalEarned = 0n;
  const monthTotals = new Map<string, { total: bigint; count: number }>();
  const clientTotals = new Map<string, { total: bigint; count: number }>();

  for (const p of sorted) {
    const amount = BigInt(p.amount);
    totalEarned += amount;

    const mk = monthKey(p.timestamp);
    const m = monthTotals.get(mk) ?? { total: 0n, count: 0 };
    monthTotals.set(mk, { total: m.total + amount, count: m.count + 1 });

    const ck = p.payer.toLowerCase();
    const c = clientTotals.get(ck) ?? { total: 0n, count: 0 };
    clientTotals.set(ck, { total: c.total + amount, count: c.count + 1 });
  }

  const byMonth: MonthBucket[] = [...monthTotals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({ month, total: v.total.toString(), count: v.count }));

  const byClient = [...clientTotals.entries()]
    .sort((a, b) => (a[1].total < b[1].total ? 1 : -1))
    .map(([payer, v]) => ({
      payer,
      total: v.total.toString(),
      count: v.count,
      share: totalEarned === 0n ? 0 : Number((v.total * 10000n) / totalEarned) / 10000,
    }));

  const monthsActive = monthTotals.size;
  const monthsObserved = Math.max(1, monthsBetween(firstPaidAt, Math.max(now, lastPaidAt)));
  const coverage = clamp01(monthsActive / monthsObserved);

  const monthly = byMonth.map((m) => BigInt(m.total));
  const medianMonthly = median(monthly);

  // Regularity: 1 minus the spread of monthly totals around their mean, so a
  // worker paid a similar amount each month scores near 1. Computed in floats
  // deliberately: it is a ratio for display and never a money figure.
  let regularity = 0;
  if (monthly.length === 1) {
    // One month of history is not evidence of regularity either way.
    regularity = 0.5;
  } else {
    const nums = monthly.map((v) => Number(v));
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    if (mean > 0) {
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
      const cv = Math.sqrt(variance) / mean;
      regularity = clamp01(1 - cv);
    }
  }

  const concentration = byClient.length > 0 ? byClient[0]!.share : 1;

  // Trend: the most recent half of observed months against the previous half.
  const window = Math.max(1, Math.floor(byMonth.length / 2));
  const recent = monthly.slice(-window).reduce((a, b) => a + b, 0n);
  const prior = monthly.slice(-window * 2, -window).reduce((a, b) => a + b, 0n);
  const trend = prior === 0n ? 1 : Number((recent * 1000n) / prior) / 1000;

  const clientFactor = clamp01((byClient.length - 1) / 2); // 1 client -> 0, 3+ -> 1
  const historyFactor = clamp01(monthsActive / 6);
  const blended =
    0.3 * regularity +
    0.25 * coverage +
    0.25 * clientFactor +
    0.2 * historyFactor;

  // Confidence is kept separate from quality and multiplied in, because the
  // quality signals are not meaningful on a thin record: a single payout has
  // perfect "coverage" of the single month it lands in, which would otherwise
  // read as a steady income. Six payouts across three months is where the
  // record starts to carry its own weight.
  const confidence = clamp01(Math.min(payouts.length / 6, monthsActive / 3));
  const stabilityScore = Math.round(clamp01(blended) * confidence * 100);

  // Illustrative ceiling: half a median month, scaled by the score. Deliberately
  // conservative, and deliberately not called an offer anywhere in the product.
  const advanceCeiling = (medianMonthly * BigInt(stabilityScore)) / 200n;

  const reasons: string[] = [];
  reasons.push(
    `${payouts.length} settled ${payouts.length === 1 ? "payout" : "payouts"} from ${byClient.length} ${byClient.length === 1 ? "client" : "clients"} across ${monthsActive} ${monthsActive === 1 ? "month" : "months"}.`,
  );
  if (byClient.length === 1) {
    reasons.push("All income comes from one client, which is the largest risk in this record.");
  } else if (concentration > 0.7) {
    reasons.push(`One client accounts for ${Math.round(concentration * 100)}% of earnings.`);
  }
  if (coverage < 0.75 && monthsObserved > 1) {
    reasons.push(`Paid in ${monthsActive} of the ${monthsObserved} months since the first payout.`);
  }
  if (monthsActive >= 3 && regularity > 0.7) {
    reasons.push("Monthly amounts are consistent.");
  }
  if (trend > 1.15) reasons.push("Recent months are above the earlier ones.");
  if (trend < 0.85 && prior > 0n) reasons.push("Recent months are below the earlier ones.");
  if (confidence < 1) {
    reasons.push(
      "This record is still too short to judge; the score is held down until there are six payouts across three months.",
    );
  }

  return {
    totalEarned: totalEarned.toString(),
    payoutCount: payouts.length,
    clientCount: byClient.length,
    monthsActive,
    monthsObserved,
    firstPaidAt,
    lastPaidAt,
    medianMonthly: medianMonthly.toString(),
    byMonth,
    byClient,
    stabilityScore,
    signals: { regularity, concentration, trend, coverage, confidence },
    advanceCeiling: advanceCeiling.toString(),
    reasons,
  };
}
