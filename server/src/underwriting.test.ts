import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, type PayoutLike } from "./underwriting.ts";

const USD = 1_000_000n;

function at(year: number, month: number, day = 15): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

function payout(payer: string, dollars: number, timestamp: number): PayoutLike {
  return {
    payer,
    payee: "0xpayee",
    amount: (BigInt(dollars) * USD).toString(),
    timestamp,
    category: "Contractor",
    label: "maria",
  };
}

const NOW = at(2026, 10, 20);

test("an empty history asserts nothing", () => {
  const a = assess([], NOW);
  assert.equal(a.totalEarned, "0");
  assert.equal(a.stabilityScore, 0);
  assert.equal(a.advanceCeiling, "0");
  assert.equal(a.clientCount, 0);
  assert.match(a.reasons[0]!, /nothing to assess/);
});

test("totals stay exact integer minor units", () => {
  const a = assess(
    [payout("0xa", 400, at(2026, 9)), payout("0xa", 333, at(2026, 10))],
    NOW,
  );
  assert.equal(a.totalEarned, (733n * USD).toString());
  assert.equal(a.payoutCount, 2);
});

test("one payout from one client does not look like stable income", () => {
  const a = assess([payout("0xa", 5000, at(2026, 10))], NOW);
  assert.equal(a.clientCount, 1);
  assert.equal(a.monthsActive, 1);
  // clientFactor 0 and historyFactor 1/6 cap this well below a usable score,
  // however large the single payment is.
  assert.ok(a.stabilityScore < 40, `expected a thin record to score low, got ${a.stabilityScore}`);
  assert.ok(a.reasons.some((r) => /one client/i.test(r)));
});

test("steady multi-client income over six months scores well", () => {
  const rows: PayoutLike[] = [];
  for (let m = 5; m <= 10; m++) {
    rows.push(payout("0xa", 600, at(2026, m, 5)));
    rows.push(payout("0xb", 300, at(2026, m, 12)));
    rows.push(payout("0xc", 100, at(2026, m, 20)));
  }
  const a = assess(rows, NOW);
  assert.equal(a.clientCount, 3);
  assert.equal(a.monthsActive, 6);
  assert.equal(a.signals.coverage, 1);
  assert.ok(a.signals.regularity > 0.95, `flat months should be regular, got ${a.signals.regularity}`);
  assert.ok(a.stabilityScore > 90, `expected a strong score, got ${a.stabilityScore}`);
  assert.equal(a.medianMonthly, (1000n * USD).toString());
  // Half a median month, scaled by the score.
  assert.equal(a.advanceCeiling, ((1000n * USD * BigInt(a.stabilityScore)) / 200n).toString());
});

test("client concentration is reported and penalised", () => {
  const rows = [
    payout("0xa", 950, at(2026, 8)),
    payout("0xa", 950, at(2026, 9)),
    payout("0xb", 50, at(2026, 9)),
  ];
  const a = assess(rows, NOW);
  assert.equal(a.byClient[0]!.payer, "0xa");
  assert.ok(a.signals.concentration > 0.9);
  assert.ok(a.reasons.some((r) => /accounts for/.test(r)));
});

test("gaps between payouts lower coverage", () => {
  // Paid in 2 of the 6 months since the first payout.
  const a = assess([payout("0xa", 500, at(2026, 5)), payout("0xa", 500, at(2026, 10))], NOW);
  assert.equal(a.monthsActive, 2);
  assert.equal(a.monthsObserved, 6);
  assert.ok(a.signals.coverage < 0.4);
  assert.ok(a.reasons.some((r) => /Paid in 2 of the 6 months/.test(r)));
});

test("months are bucketed and ordered oldest first", () => {
  const a = assess(
    [payout("0xa", 100, at(2026, 10)), payout("0xa", 200, at(2026, 8))],
    NOW,
  );
  assert.deepEqual(
    a.byMonth.map((m) => m.month),
    ["2026-08", "2026-10"],
  );
});

test("a rising trend is detected", () => {
  const rows = [
    payout("0xa", 200, at(2026, 7)),
    payout("0xa", 200, at(2026, 8)),
    payout("0xa", 800, at(2026, 9)),
    payout("0xa", 800, at(2026, 10)),
  ];
  const a = assess(rows, NOW);
  assert.ok(a.signals.trend > 1.15, `expected a rising trend, got ${a.signals.trend}`);
  assert.ok(a.reasons.some((r) => /above the earlier/.test(r)));
});

test("assessment is a pure function of its inputs", () => {
  const rows = [payout("0xa", 400, at(2026, 9)), payout("0xb", 400, at(2026, 10))];
  assert.deepEqual(assess(rows, NOW), assess(rows, NOW));
});

test("a thin record is held down by confidence, not by quality signals", () => {
  const one = assess([payout("0xa", 5000, at(2026, 10))], NOW);
  assert.equal(one.signals.confidence, 1 / 6);
  assert.ok(one.stabilityScore < 10, `one payout should barely score, got ${one.stabilityScore}`);
  assert.ok(one.reasons.some((r) => /too short to judge/.test(r)));

  // The same quality signals with enough history behind them score far higher.
  const many = assess(
    [3, 4, 5, 6, 7, 8].flatMap((m) => [payout("0xa", 500, at(2026, m, 4)), payout("0xb", 500, at(2026, m, 18))]),
    NOW,
  );
  assert.equal(many.signals.confidence, 1);
  assert.ok(many.stabilityScore > one.stabilityScore * 5);
});

test("a declining trend is detected and noted in reasons", () => {
  const rows = [
    payout("0xa", 800, at(2026, 7)),
    payout("0xa", 800, at(2026, 8)),
    payout("0xa", 200, at(2026, 9)),
    payout("0xa", 200, at(2026, 10)),
  ];
  const a = assess(rows, NOW);
  assert.ok(a.signals.trend < 0.85, `expected declining trend, got ${a.signals.trend}`);
  assert.ok(a.reasons.some((r) => /below the earlier/.test(r)));
});

test("large amounts maintain bigint precision", () => {
  const bigDollars = 1_000_000_000; // $1 billion
  const a = assess([payout("0xa", bigDollars, at(2026, 10))], NOW);
  assert.equal(a.totalEarned, (BigInt(bigDollars) * USD).toString());
});

test("when stabilityScore is 0 advanceCeiling is 0", () => {
  const a = assess([], NOW);
  assert.equal(a.stabilityScore, 0);
  assert.equal(a.advanceCeiling, "0");
});

