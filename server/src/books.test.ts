import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBooks, toCsv, THRESHOLD_1099_MINOR } from "./books.ts";
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

test("the 1099 threshold is $600 in minor units", () => {
  assert.equal(THRESHOLD_1099_MINOR, 600_000_000n);
});

test("month totals and the month before it", () => {
  const b = buildBooks(
    [
      row({ dollars: 400, timestamp: at(2026, 10) }),
      row({ dollars: 100, timestamp: at(2026, 10) }),
      row({ dollars: 250, timestamp: at(2026, 9) }),
    ],
    "2026-10",
  );
  assert.equal(b.month, "2026-10");
  assert.equal(b.previousMonth, "2026-09");
  assert.equal(b.monthTotal, (500n * USD).toString());
  assert.equal(b.previousMonthTotal, (250n * USD).toString());
});

test("the previous month crosses a year boundary", () => {
  const b = buildBooks([row({ dollars: 10, timestamp: at(2026, 1) })], "2026-01");
  assert.equal(b.previousMonth, "2025-12");
});

test("categories are totalled largest first", () => {
  const b = buildBooks(
    [
      row({ dollars: 100, category: "Software" }),
      row({ dollars: 700, category: "Contractor" }),
      row({ dollars: 300, category: "Rent" }),
    ],
    "2026-10",
  );
  assert.deepEqual(
    b.byCategory.map((c) => c.category),
    ["Contractor", "Rent", "Software"],
  );
  assert.equal(b.byCategory[0]!.total, (700n * USD).toString());
});

test("a contractor paid exactly $600 in the year is reportable", () => {
  const b = buildBooks(
    [
      row({ dollars: 300, label: "maria", timestamp: at(2026, 3) }),
      row({ dollars: 300, label: "maria", timestamp: at(2026, 7) }),
      row({ dollars: 599, label: "ben", payee: "0xben", timestamp: at(2026, 7) }),
    ],
    "2026-10",
  );
  const maria = b.yearToDate.contractors.find((c) => c.label === "maria");
  const ben = b.yearToDate.contractors.find((c) => c.label === "ben");
  assert.equal(maria?.over1099, true, "$600 exactly must be reportable");
  assert.equal(ben?.over1099, false);
});

test("only Contractor rows count toward 1099 totals", () => {
  const b = buildBooks(
    [row({ dollars: 5000, category: "Rent", label: "landlord", payee: "0xland" })],
    "2026-10",
  );
  assert.equal(b.yearToDate.contractors.length, 0);
});

test("the year-to-date total covers the whole year, not the month", () => {
  const b = buildBooks(
    [
      row({ dollars: 100, timestamp: at(2026, 2) }),
      row({ dollars: 100, timestamp: at(2026, 10) }),
    ],
    "2026-10",
  );
  assert.equal(b.monthTotal, (100n * USD).toString());
  assert.equal(b.yearToDate.total, (200n * USD).toString());
});

test("csv writes amounts as plain decimals a spreadsheet reads as numbers", () => {
  const csv = toCsv([row({ dollars: 400, timestamp: at(2026, 10, 3) })]);
  const [header, first] = csv.trim().split("\n");
  assert.equal(header, "date,payee_label,payee_address,category,amount,memo,receipt_no,tx_hash");
  assert.ok(first!.startsWith("2026-10-03,maria,0xpayee,Contractor,400.000000,"), first);
});

test("csv quotes a memo containing a comma", () => {
  const csv = toCsv([row({ memo: 'October, part two: "final"' })]);
  assert.ok(csv.includes('"October, part two: ""final"""'), csv);
});

test("csv rows run oldest first", () => {
  const csv = toCsv([
    row({ timestamp: at(2026, 10, 9) }),
    row({ timestamp: at(2026, 10, 1) }),
  ]);
  const lines = csv.trim().split("\n");
  assert.ok(lines[1]!.startsWith("2026-10-01"));
  assert.ok(lines[2]!.startsWith("2026-10-09"));
});

test("csv handles empty rows returning only the header", () => {
  const csv = toCsv([]);
  assert.equal(csv, "date,payee_label,payee_address,category,amount,memo,receipt_no,tx_hash\n");
});

test("csv sanitizes formula injection characters (=, +, @, -cmd)", () => {
  const csv = toCsv([
    row({
      label: '=HYPERLINK("http://evil.com","click")',
      memo: "+cmd|' /C calc'!A0",
      category: "@Contractor",
    }),
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+cmd|"));
  assert.ok(csv.includes("'@Contractor"));
});

test("csv formats negative amounts correctly without losing sign or padding", () => {
  const csv = toCsv([
    row({ amount: "-500000" }), // -$0.50
    row({ amount: "-1500000" }), // -$1.50
  ]);
  assert.ok(csv.includes("-0.500000"));
  assert.ok(csv.includes("-1.500000"));
});

test("buildBooks handles empty rows gracefully", () => {
  const b = buildBooks([]);
  assert.equal(b.monthTotal, "0");
  assert.equal(b.previousMonthTotal, "0");
  assert.deepEqual(b.byCategory, []);
  assert.deepEqual(b.byPayee, []);
  assert.deepEqual(b.yearToDate.contractors, []);
});

test("buildBooks sorts categories stably when amounts are equal", () => {
  const b = buildBooks([
    row({ dollars: 100, category: "Software" }),
    row({ dollars: 100, category: "Rent" }),
  ], "2026-10");
  assert.equal(b.byCategory.length, 2);
  assert.equal(b.byCategory[0]!.total, (100n * USD).toString());
  assert.equal(b.byCategory[1]!.total, (100n * USD).toString());
});

