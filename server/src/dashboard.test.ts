import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard } from "./dashboard.ts";
import type { PayoutRow } from "./db.ts";

const USD = 1_000_000n;

function at(year: number, month: number, day = 15): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

let receipt = 0;
function row(over: Partial<PayoutRow> & { dollars?: number }): PayoutRow {
  const { dollars = 100, ...rest } = over;
  return {
    receipt_no: ++receipt,
    payer: "0xpayer",
    payee: "0xpayee",
    amount: (BigInt(dollars) * USD).toString(),
    label: "maria",
    memo: "",
    category: "Contractor",
    passport_eligible: true,
    timestamp: at(2026, 10),
    tx_hash: "0xdead",
    block_number: 1,
    ...rest,
  };
}

const NOW = at(2026, 10, 20);

test("an empty account still returns a usable shape", () => {
  const d = buildDashboard([], 0, NOW);
  assert.equal(d.monthTotal, "0");
  assert.equal(d.byMonth.length, 6);
  assert.equal(d.lifetime.payouts, 0);
  assert.equal(d.lifetime.firstPayoutAt, null);
  assert.deepEqual(d.needs1099, []);
});

test("the month series is zero-filled and oldest first", () => {
  const d = buildDashboard(
    [row({ dollars: 500, timestamp: at(2026, 10) }), row({ dollars: 200, timestamp: at(2026, 8) })],
    1,
    NOW,
  );
  assert.deepEqual(
    d.byMonth.map((m) => m.month),
    ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  );
  // A quiet month is a zero bar, not a missing one.
  assert.equal(d.byMonth.find((m) => m.month === "2026-09")?.total, "0");
  assert.equal(d.byMonth.find((m) => m.month === "2026-08")?.total, (200n * USD).toString());
});

test("month delta is signed against the previous month", () => {
  const up = buildDashboard(
    [row({ dollars: 900, timestamp: at(2026, 10) }), row({ dollars: 400, timestamp: at(2026, 9) })],
    1,
    NOW,
  );
  assert.equal(up.monthDelta, (500n * USD).toString());

  const down = buildDashboard(
    [row({ dollars: 100, timestamp: at(2026, 10) }), row({ dollars: 400, timestamp: at(2026, 9) })],
    1,
    NOW,
  );
  assert.equal(down.monthDelta, (-300n * USD).toString());
});

test("a contractor at exactly $600 is flagged for filing", () => {
  const d = buildDashboard(
    [
      row({ dollars: 300, label: "maria", timestamp: at(2026, 3) }),
      row({ dollars: 300, label: "maria", timestamp: at(2026, 7) }),
    ],
    1,
    NOW,
  );
  assert.equal(d.needs1099.length, 1);
  assert.equal(d.needs1099[0]!.label, "maria");
  assert.equal(d.approaching1099.length, 0);
});

test("a contractor within $100 of the threshold is surfaced early", () => {
  const d = buildDashboard([row({ dollars: 540, label: "ben", payee: "0xben" })], 1, NOW);
  assert.equal(d.needs1099.length, 0);
  assert.equal(d.approaching1099.length, 1);
  assert.equal(d.approaching1099[0]!.remaining, (60n * USD).toString());
});

test("a contractor well under the threshold is not surfaced at all", () => {
  const d = buildDashboard([row({ dollars: 120, label: "ana", payee: "0xana" })], 1, NOW);
  assert.equal(d.needs1099.length, 0);
  assert.equal(d.approaching1099.length, 0);
});

test("only contractor spend counts toward the filing figures", () => {
  const d = buildDashboard(
    [row({ dollars: 5000, category: "Rent", label: "studio", payee: "0xstudio" })],
    1,
    NOW,
  );
  assert.equal(d.needs1099.length, 0);
  assert.equal(d.yearToDate.contractorTotal, "0");
  assert.equal(d.yearToDate.total, (5000n * USD).toString());
  assert.equal(d.people.contractors, 0);
});

test("recent activity is newest first and capped at six", () => {
  const rows = Array.from({ length: 9 }, (_, i) =>
    row({ dollars: 10 + i, timestamp: at(2026, 10, i + 1) }),
  );
  const d = buildDashboard(rows, 1, NOW);
  assert.equal(d.recent.length, 6);
  assert.equal(d.recent[0]!.timestamp, at(2026, 10, 9));
  assert.ok(d.recent[0]!.timestamp > d.recent[5]!.timestamp);
});

test("lifetime totals cover every row, not just the window", () => {
  const d = buildDashboard(
    [row({ dollars: 100, timestamp: at(2024, 1) }), row({ dollars: 250, timestamp: at(2026, 10) })],
    2,
    NOW,
  );
  assert.equal(d.lifetime.payouts, 2);
  assert.equal(d.lifetime.total, (350n * USD).toString());
  assert.equal(d.lifetime.firstPayoutAt, at(2024, 1));
  // Year to date is 2026 only.
  assert.equal(d.yearToDate.total, (250n * USD).toString());
});

test("the window anchors on the latest payout, not the clock", () => {
  // Last activity was August; the chart should end there rather than showing
  // two empty months at the end.
  const d = buildDashboard([row({ dollars: 100, timestamp: at(2026, 8) })], 1, NOW);
  assert.equal(d.month, "2026-08");
  assert.equal(d.byMonth[d.byMonth.length - 1]!.month, "2026-08");
});
