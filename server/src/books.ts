// Payer-side aggregation: the Books screen and the CSV an accountant gets.
// Every figure here is derived from indexed payouts. There is no second source
// of truth to reconcile against.

import type { PayoutRow } from "./db.ts";

export const CATEGORIES = ["Contractor", "Software", "Rent", "Supplies", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

/** US businesses must report contractors paid $600 or more in a calendar year. */
export const THRESHOLD_1099_MINOR = 600n * 1_000_000n; // $600.00 at 6 decimals

export type Books = {
  month: string;
  previousMonth: string;
  monthTotal: string;
  previousMonthTotal: string;
  byCategory: { category: string; total: string; count: number }[];
  byPayee: { label: string; payee: string; total: string; count: number }[];
  months: string[];
  yearToDate: {
    year: string;
    total: string;
    contractors: { label: string; payee: string; total: string; count: number; over1099: boolean }[];
  };
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

function groupTotals<K extends string>(
  rows: PayoutRow[],
  key: (r: PayoutRow) => K,
): { key: K; total: bigint; count: number }[] {
  const map = new Map<K, { total: bigint; count: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = map.get(k) ?? { total: 0n, count: 0 };
    map.set(k, { total: cur.total + BigInt(r.amount), count: cur.count + 1 });
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, total: v.total, count: v.count }))
    .sort((a, b) => (a.total < b.total ? 1 : -1));
}

export function buildBooks(rows: PayoutRow[], month?: string): Books {
  const months = [...new Set(rows.map((r) => monthOf(r.timestamp)))].sort().reverse();
  const current = month ?? months[0] ?? monthOf(Math.floor(Date.now() / 1000));
  const previous = shiftMonth(current, -1);
  const year = current.slice(0, 4);

  const inMonth = rows.filter((r) => monthOf(r.timestamp) === current);
  const inPrevious = rows.filter((r) => monthOf(r.timestamp) === previous);
  const inYear = rows.filter((r) => monthOf(r.timestamp).startsWith(year));

  const contractors = groupTotals(
    inYear.filter((r) => r.category === "Contractor"),
    (r) => `${r.label}\u0000${r.payee}` as string,
  ).map((g) => {
    const [label, payee] = g.key.split("\u0000") as [string, string];
    return {
      label: label || payee.slice(0, 10),
      payee,
      total: g.total.toString(),
      count: g.count,
      over1099: g.total >= THRESHOLD_1099_MINOR,
    };
  });

  return {
    month: current,
    previousMonth: previous,
    monthTotal: sum(inMonth).toString(),
    previousMonthTotal: sum(inPrevious).toString(),
    byCategory: groupTotals(inMonth, (r) => r.category).map((g) => ({
      category: g.key,
      total: g.total.toString(),
      count: g.count,
    })),
    byPayee: groupTotals(inMonth, (r) => `${r.label}\u0000${r.payee}`).map((g) => {
      const [label, payee] = g.key.split("\u0000") as [string, string];
      return { label: label || payee.slice(0, 10), payee, total: g.total.toString(), count: g.count };
    }),
    months,
    yearToDate: { year, total: sum(inYear).toString(), contractors },
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Amounts are written as plain decimal strings so a spreadsheet reads them as numbers. */
export function toCsv(rows: PayoutRow[], decimals = 6): string {
  const header = [
    "date",
    "payee_label",
    "payee_address",
    "category",
    "amount",
    "memo",
    "receipt_no",
    "tx_hash",
  ];
  const lines = [header.join(",")];

  for (const r of [...rows].sort((a, b) => a.timestamp - b.timestamp)) {
    const minor = BigInt(r.amount);
    const base = 10n ** BigInt(decimals);
    const amount = `${minor / base}.${(minor % base).toString().padStart(decimals, "0")}`;
    lines.push(
      [
        new Date(r.timestamp * 1000).toISOString().slice(0, 10),
        r.label,
        r.payee,
        r.category,
        amount,
        r.memo,
        String(r.receipt_no),
        r.tx_hash,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
