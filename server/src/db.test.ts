import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, type PayoutRow } from "./db.ts";

function createStore(): Store {
  return new Store(":memory:");
}

function sampleRow(over: Partial<PayoutRow> = {}): PayoutRow {
  return {
    receipt_no: 1,
    payer: "0x1111111111111111111111111111111111111111",
    payee: "0x2222222222222222222222222222222222222222",
    amount: "500000000",
    label: "maria",
    memo: "design work",
    category: "Contractor",
    passport_eligible: true,
    timestamp: 1700000000,
    tx_hash: "0xabc123",
    block_number: 100,
    ...over,
  };
}

test("db: stores and retrieves cursor", () => {
  const store = createStore();
  try {
    assert.equal(store.getCursor(10n), 10n);
    store.setCursor(42n);
    assert.equal(store.getCursor(10n), 42n);
    store.setCursor(100n);
    assert.equal(store.getCursor(10n), 100n);
  } finally {
    store.close();
  }
});

test("db: selectPayoutContract detects change and clears rows", () => {
  const store = createStore();
  try {
    store.upsertPayout(sampleRow());
    store.setCursor(50n);
    assert.equal(store.counts().payouts, 1);

    // Initial setting of payouts contract
    const changed1 = store.selectPayoutContract("0xPayoutsContract1");
    assert.equal(changed1, true);
    assert.equal(store.counts().payouts, 0);
    assert.equal(store.getCursor(0n), 0n);

    // Same contract address (case-insensitive) should return false and not clear
    store.upsertPayout(sampleRow());
    assert.equal(store.counts().payouts, 1);
    const changed2 = store.selectPayoutContract("0xpayoutscontract1");
    assert.equal(changed2, false);
    assert.equal(store.counts().payouts, 1);

    // Different contract address clears again
    const changed3 = store.selectPayoutContract("0xPayoutsContract2");
    assert.equal(changed3, true);
    assert.equal(store.counts().payouts, 0);
  } finally {
    store.close();
  }
});

test("db: upsertPayout is idempotent and normalizes addresses to lowercase", () => {
  const store = createStore();
  try {
    const row = sampleRow({
      payer: "0xAbCdEf1111111111111111111111111111111111",
      payee: "0xFeDcBa2222222222222222222222222222222222",
    });
    store.upsertPayout(row);
    assert.equal(store.counts().payouts, 1);

    const fetched = store.payoutByReceipt(1);
    assert.ok(fetched);
    assert.equal(fetched.payer, "0xabcdef1111111111111111111111111111111111");
    assert.equal(fetched.payee, "0xfedcba2222222222222222222222222222222222");
    assert.equal(fetched.passport_eligible, true);
    assert.equal(typeof fetched.passport_eligible, "boolean");

    // Upserting again updates the row
    store.upsertPayout({ ...row, label: "maria updated", amount: "600000000" });
    assert.equal(store.counts().payouts, 1);
    const updated = store.payoutByReceipt(1);
    assert.ok(updated);
    assert.equal(updated.label, "maria updated");
    assert.equal(updated.amount, "600000000");
  } finally {
    store.close();
  }
});

test("db: payoutsByPayer and payoutsByPayee filter case-insensitively with ordering and limits", () => {
  const store = createStore();
  try {
    const payer = "0x1111111111111111111111111111111111111111";
    const payee = "0x2222222222222222222222222222222222222222";

    store.upsertPayout(sampleRow({ receipt_no: 1, timestamp: 1000 }));
    store.upsertPayout(sampleRow({ receipt_no: 2, timestamp: 2000 }));
    store.upsertPayout(sampleRow({ receipt_no: 3, timestamp: 3000, payer: "0xother" }));

    // By payer - upper case query
    const byPayer = store.payoutsByPayer(payer.toUpperCase());
    assert.equal(byPayer.length, 2);
    // Ordered by timestamp DESC
    assert.equal(byPayer[0]!.receipt_no, 2);
    assert.equal(byPayer[1]!.receipt_no, 1);

    // Limit respects bounds
    const limited = store.payoutsByPayer(payer, 1);
    assert.equal(limited.length, 1);
    assert.equal(limited[0]!.receipt_no, 2);

    // By payee
    const byPayee = store.payoutsByPayee(payee.toUpperCase());
    assert.equal(byPayee.length, 3);
    assert.equal(byPayee[0]!.receipt_no, 3);
  } finally {
    store.close();
  }
});

test("db: passport_eligible is boolean false when 0", () => {
  const store = createStore();
  try {
    store.upsertPayout(sampleRow({ receipt_no: 1, passport_eligible: false }));
    const row = store.payoutByReceipt(1);
    assert.ok(row);
    assert.strictEqual(row.passport_eligible, false);
  } finally {
    store.close();
  }
});
