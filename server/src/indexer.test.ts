import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.ts";
import { Store } from "./db.ts";
import { Indexer } from "./indexer.ts";

const PAYOUTS = "0x1111111111111111111111111111111111111111" as const;
const PAYER = "0x2222222222222222222222222222222222222222" as const;
const PAYEE = "0x3333333333333333333333333333333333333333" as const;

function config(finalityBlocks: string) {
  return loadConfig({
    NETWORK: "local",
    PAYOUTS_ADDRESS: PAYOUTS,
    INDEX_FINALITY_BLOCKS: finalityBlocks,
    REORG_LOOKBACK_BLOCKS: "32",
    LOG_CHUNK: "20",
  });
}

function payment(receiptNo: bigint, blockNumber: bigint, blockHash: `0x${string}`, amount = 100n) {
  return {
    args: { receiptNo, payer: PAYER, payee: PAYEE, amount, passportEligible: true, timestamp: 1000n },
    transactionHash: `0xtx${receiptNo}`,
    blockNumber,
    blockHash,
  };
}

test("indexer: waits for finality, then indexes a block when it becomes eligible", async () => {
  const store = new Store(":memory:");
  let head = 5n;
  const events = [payment(1n, 4n, "0x04")];
  const client = {
    getBlockNumber: async () => head,
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
      events.filter((event) => event.blockNumber >= fromBlock && event.blockNumber <= toBlock),
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ hash: `0x${blockNumber}` }),
  };
  try {
    const indexer = new Indexer(config("2"), store, client as any);
    await indexer.runOnce();
    assert.equal(store.payoutByReceipt(1), undefined);
    assert.equal(indexer.getStatus().finalizedHead, "3");

    head = 6n;
    await indexer.runOnce();
    assert.equal(store.payoutByReceipt(1)?.block_number, 4);
    assert.equal(indexer.getStatus().cursor, "5");
  } finally {
    store.close();
  }
});

test("indexer: removes a reorged suffix before replaying canonical logs", async () => {
  const store = new Store(":memory:");
  let canonicalHash = "0xold" as `0x${string}`;
  let events = [payment(1n, 2n, canonicalHash, 100n)];
  const client = {
    getBlockNumber: async () => 5n,
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
      events.filter((event) => event.blockNumber >= fromBlock && event.blockNumber <= toBlock),
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      hash: blockNumber === 2n ? canonicalHash : (`0x${blockNumber}` as `0x${string}`),
    }),
  };
  try {
    const indexer = new Indexer(config("0"), store, client as any);
    await indexer.runOnce();
    assert.equal(store.payoutByReceipt(1)?.amount, "100");

    canonicalHash = "0xnew";
    events = [payment(1n, 2n, canonicalHash, 250n)];
    await indexer.runOnce();

    const canonical = store.payoutByReceipt(1);
    assert.ok(canonical);
    assert.equal(canonical.amount, "250");
    assert.equal(canonical.block_hash, "0xnew");
  } finally {
    store.close();
  }
});
