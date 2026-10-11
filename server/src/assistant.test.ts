import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, answer } from "./assistant.ts";
import type { Config } from "./config.ts";
import type { PayoutRow } from "./db.ts";

function row(over: Partial<PayoutRow> = {}): PayoutRow {
  return {
    receipt_no: 1,
    payer: "0xpayer",
    payee: "0xpayee",
    amount: "400000000",
    label: "Maria",
    memo: "October payout",
    category: "Contractor",
    passport_eligible: true,
    timestamp: 1760000000,
    tx_hash: "0xhash",
    block_number: 1,
    ...over,
  };
}

const mockConfig: Config = {
  port: 8787,
  host: "127.0.0.1",
  trustProxy: false,
  network: "local",
  chain: {} as any,
  rpcUrl: "http://127.0.0.1:8545",
  payoutsAddress: null,
  tokenAddress: null,
  startBlock: 0n,
  dbPath: ":memory:",
  devMintKey: null,
  pollMs: 1000,
  logChunk: 2000n,
  corsOrigins: ["http://localhost:5173"],
  assistant: {
    maxRequests: 20,
    maxRequestsPerKey: 5,
    windowMs: 60000,
    maxConcurrent: 4,
    maxBuckets: 1000,
  },
  kimi: {
    apiKey: null,
    enabled: false,
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k2-0905-preview",
  },
};

test("assistant: summarise calculates totals, categories, payees, and range", () => {
  const rows: PayoutRow[] = [
    row({ receipt_no: 1, amount: "100000000", category: "Contractor", label: "Alice", timestamp: 1700000000 }),
    row({ receipt_no: 2, amount: "200000000", category: "Software", label: "Bob", timestamp: 1700086400 }),
  ];

  const facts = summarise(rows);
  assert.equal(facts.rowCount, 2);
  assert.equal(facts.totalMinor, "300000000");
  assert.equal(facts.byCategory["Contractor"], "100000000");
  assert.equal(facts.byCategory["Software"], "200000000");
  assert.equal(facts.byPayee["Alice"], "100000000");
  assert.equal(facts.byPayee["Bob"], "200000000");
  assert.ok(facts.range.from !== null);
  assert.ok(facts.range.to !== null);
});

test("assistant: summarise is prototype pollution safe", () => {
  const rows: PayoutRow[] = [
    row({ receipt_no: 1, label: "toString", category: "valueOf", amount: "500000000" }),
    row({ receipt_no: 2, label: "constructor", category: "__proto__", amount: "100000000" }),
  ];

  // Must not throw or inherit from Object.prototype
  const facts = summarise(rows);
  assert.equal(facts.rowCount, 2);
  assert.equal(facts.totalMinor, "600000000");
  assert.equal(facts.byPayee["toString"], "500000000");
  assert.equal(facts.byCategory["valueOf"], "500000000");
  assert.equal(facts.byPayee["constructor"], "100000000");
});

test("assistant: summarise handles empty rows", () => {
  const facts = summarise([]);
  assert.equal(facts.rowCount, 0);
  assert.equal(facts.totalMinor, "0");
  assert.equal(facts.range.from, null);
  assert.equal(facts.range.to, null);
});

test("assistant: answer returns local fallback when kimi is disabled", async () => {
  const rows: PayoutRow[] = [
    row({ receipt_no: 1, amount: "400000000", label: "Maria" }),
  ];

  const result = await answer("How much did I pay Maria?", rows, mockConfig);
  assert.equal(result.source, "fallback");
  assert.ok(result.answer.includes("$400.00"));
  assert.ok(result.answer.includes("Maria"));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.label, "Maria");
});

test("assistant: answer handles empty rows with fallback message", async () => {
  const result = await answer("How much did I pay?", [], mockConfig);
  assert.equal(result.source, "fallback");
  assert.match(result.answer, /no payouts in this account/i);
});

test("assistant: answer falls back gracefully if remote fetch fails", async () => {
  const configWithKimi: Config = {
    ...mockConfig,
    kimi: {
      apiKey: "sk-fake-key",
      enabled: true,
      baseUrl: "https://api.moonshot.ai/v1",
      model: "kimi-k2-0905-preview",
    },
  };

  const failingFetch: typeof fetch = async () => {
    throw new Error("Network error connecting to API");
  };

  const result = await answer("How much total?", [row()], configWithKimi, failingFetch);
  assert.equal(result.source, "fallback");
  assert.ok(result.note?.includes("Network error"));
  assert.ok(result.answer.includes("$400.00"));
});
