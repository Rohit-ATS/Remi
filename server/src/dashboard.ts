// The dashboard aggregate.
//
// One endpoint rather than five round trips, because the first screen after
// sign-in should not wait on a waterfall. Everything here is derived from
// indexed payouts; there is no second source of truth.

import type { PayoutRow } from "./db.ts";
import { THRESHOLD_1099_MINOR } from "./books.ts";

export type MonthPoint = { month: string; total: string; count: number };

export type Dashboard = {
  /** YYYY-MM of the most recent activity, or the current month when there is none. */
  month: string;
  previousMonth: string;
  monthTotal: string;
  previousMonthTotal: string;
  /** Signed difference against the previous month, in minor units. */
  monthDelta: string;
  /** Oldest first, always `span` entries long, zero-filled so the chart has no gaps. */
  byMonth: MonthPoint[];
  recent: PayoutRow[];
  lifetime: { payouts: number; total: string; firstPayoutAt: number | null };
  yearToDate: { year: string; total: string; contractorTotal: string };
  people: { payees: number; contractors: number };
  /** Contractors at or past the $600 filing threshold this calendar year. */
  needs1099: { label: string; payee: string; total: string; count: number }[];
  /** Contractors within $100 of the threshold, so the owner sees it coming. */
  approaching1099: { label: string; payee: string; total: string; remaining: string }[];
};

function monthOf(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sum(rows: PayoutRow[]): bigint {
  return rows.reduce((acc, r) => acc + BigInt(r.amount), 0n);
}

const NEAR_THRESHOLD = 100n * 1_000_000n; // $100

export function buildDashboard(
  rows: PayoutRow[],
  payeeCount: number,
  now: number = Math.floor(Date.now() / 1000),
  span = 6,
): Dashboard {
  const sorted = [...rows].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0];
  const month = latest ? monthOf(latest.timestamp) : monthOf(now);
  const previous = shiftMonth(month, -1);
  const year = month.slice(0, 4);

  const monthTotal = sum(rows.filter((r) => monthOf(r.timestamp) === month));
  const previousTotal = sum(rows.filter((r) => monthOf(r.timestamp) === previous));

  // Zero-filled so a quiet month reads as a gap in the bars rather than
  // disappearing and making the series look continuous.
  const byMonth: MonthPoint[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const key = shiftMonth(month, -i);
    const inMonth = rows.filter((r) => monthOf(r.timestamp) === key);
    byMonth.push({ month: key, total: sum(inMonth).toString(), count: inMonth.length });
  }

  const inYear = rows.filter((r) => monthOf(r.timestamp).startsWith(year));
  const contractorsInYear = inYear.filter((r) => r.category === "Contractor");

  const perContractor = new Map<string, { label: string; total: bigint; count: number }>();
  for (const r of contractorsInYear) {
    const key = r.payee;
    const cur = perContractor.get(key) ?? { label: r.label || r.payee.slice(0, 10), total: 0n, count: 0 };
    perContractor.set(key, {
      label: r.label || cur.label,
      total: cur.total + BigInt(r.amount),
      count: cur.count + 1,
    });
  }

  const needs1099: Dashboard["needs1099"] = [];
  const approaching1099: Dashboard["approaching1099"] = [];
  for (const [payee, v] of perContractor) {
    if (v.total >= THRESHOLD_1099_MINOR) {
      needs1099.push({ label: v.label, payee, total: v.total.toString(), count: v.count });
    } else if (THRESHOLD_1099_MINOR - v.total <= NEAR_THRESHOLD) {
      approaching1099.push({
        label: v.label,
        payee,
        total: v.total.toString(),
        remaining: (THRESHOLD_1099_MINOR - v.total).toString(),
      });
    }
  }
  needs1099.sort((a, b) => (BigInt(a.total) < BigInt(b.total) ? 1 : -1));
  approaching1099.sort((a, b) => (BigInt(a.remaining) < BigInt(b.remaining) ? -1 : 1));

  const oldest = sorted[sorted.length - 1];

  return {
    month,
    previousMonth: previous,
    monthTotal: monthTotal.toString(),
    previousMonthTotal: previousTotal.toString(),
    monthDelta: (monthTotal - previousTotal).toString(),
    byMonth,
    recent: sorted.slice(0, 6),
    lifetime: {
      payouts: rows.length,
      total: sum(rows).toString(),
      firstPayoutAt: oldest ? oldest.timestamp : null,
    },
    yearToDate: {
      year,
      total: sum(inYear).toString(),
      contractorTotal: sum(contractorsInYear).toString(),
    },
    people: { payees: payeeCount, contractors: perContractor.size },
    needs1099,
    approaching1099,
  };
}
