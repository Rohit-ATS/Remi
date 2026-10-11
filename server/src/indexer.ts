// Chain watcher. Polls privacy-preserving PaymentSent receipts into SQLite.
//
// Why an index at all: the two features that make Remi a network cannot read
// from the payer's device. A recipient opening /r/:receiptNo has no account and
// no keys, and a Passport aggregates payouts from several unrelated payers. Both
// need a read that does not belong to whoever happens to be holding the phone.

import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import type { Config } from "./config.ts";
import type { Store } from "./db.ts";

// Written as signatures rather than looked up in the generated ABI: viem infers
// `log.args` from the literal type, which a runtime `.find()` cannot provide.
// They must stay in step with contracts/RemiPayouts.sol.
const paymentSent = parseAbiItem(
  "event PaymentSent(uint256 indexed receiptNo, address indexed payer, address indexed payee, uint256 amount, bool passportEligible, uint64 timestamp)",
);

export function makeClient(config: Config): PublicClient {
  return createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) }) as PublicClient;
}

export type IndexerStatus = {
  running: boolean;
  cursor: string;
  head: string | null;
  finalizedHead: string | null;
  lastError: string | null;
  lastRunAt: number | null;
};

export class Indexer {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private status: IndexerStatus = {
    running: false,
    cursor: "0",
    head: null,
    finalizedHead: null,
    lastError: null,
    lastRunAt: null,
  };

  // Fields are declared and assigned explicitly rather than as constructor
  // parameter properties, which Node's type-stripping loader rejects.
  private readonly config: Config;
  private readonly store: Store;
  private readonly client: PublicClient;
  private readonly log: (msg: string) => void;

  constructor(
    config: Config,
    store: Store,
    client: PublicClient,
    log: (msg: string) => void = () => {},
  ) {
    this.config = config;
    this.store = store;
    this.client = client;
    this.log = log;
  }

  getStatus(): IndexerStatus {
    return { ...this.status, cursor: this.store.getCursor(this.config.startBlock).toString() };
  }

  start(): void {
    if (this.config.payoutsAddress === null) {
      this.log("indexer idle: PAYOUTS_ADDRESS is not set");
      return;
    }
    if (this.store.selectPayoutContract(this.config.payoutsAddress)) {
      this.log("configured payout contract changed; cleared the local index before reindexing");
    }
    this.status.running = true;
    const tick = () => {
      void this.runOnce();
    };
    tick();
    this.timer = setInterval(tick, this.config.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status.running = false;
  }

  /** One catch-up pass. Safe to call concurrently; overlapping calls return early. */
  async runOnce(): Promise<void> {
    const address = this.config.payoutsAddress;
    if (address === null || this.busy) return;
    this.busy = true;
    try {
      const head = await this.client.getBlockNumber();
      this.status.head = head.toString();

      // Latest logs are provisional. Only add a block to the public projection
      // once it is behind the configured confirmation horizon.
      if (head < this.config.finalityBlocks) {
        this.status.finalizedHead = null;
        this.status.lastError = null;
        return;
      }
      const finalizedHead = head - this.config.finalityBlocks;
      this.status.finalizedHead = finalizedHead.toString();

      let cursor = this.store.getCursor(this.config.startBlock);
      // A previously optimistic configuration/database may have advanced past
      // today's finality horizon. Remove that provisional tail before serving
      // another request under the stricter policy.
      if (cursor > finalizedHead + 1n) {
        this.store.rewindFrom(finalizedHead + 1n);
        cursor = finalizedHead + 1n;
        this.log(`removed provisional index tail above finalized block ${finalizedHead}`);
      }
      cursor = await this.reconcile(cursor, finalizedHead);
      while (cursor <= finalizedHead) {
        const to =
          cursor + this.config.logChunk - 1n > finalizedHead
            ? finalizedHead
            : cursor + this.config.logChunk - 1n;
        await this.ingestRange(address, cursor, to);
        this.store.setCursor(to + 1n);
        cursor = to + 1n;
      }
      this.status.lastError = null;
    } catch (error) {
      // A failed pass leaves the cursor where it was, so the next tick retries
      // the same range instead of skipping it.
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.log(`indexer error: ${this.status.lastError}`);
    } finally {
      this.status.lastRunAt = Date.now();
      this.busy = false;
    }
  }

  /**
   * Reorgs are unusual after the finality horizon, but the read model is
   * credit-facing and must not retain a removed event. Compare persisted block
   * hashes in a bounded trailing window; on any mismatch remove the suffix and
   * replay it from the canonical RPC response. The confirmation horizon is the
   * canonicality boundary: a reorg deeper than that chain-specific policy is a
   * finality-assumption failure and needs operator incident handling.
   */
  private async reconcile(cursor: bigint, finalizedHead: bigint): Promise<bigint> {
    if (cursor <= this.config.startBlock) return cursor;
    // A database created before block-hash tracking has no proof that its rows
    // are canonical. Replay its earliest legacy suffix once rather than leaving
    // unverified receipts behind merely because they predate the lookback.
    const legacyBlock = this.store.firstMissingBlockHash();
    if (legacyBlock !== null) {
      this.store.rewindFrom(legacyBlock);
      this.log(`legacy block hash missing at ${legacyBlock}; replaying indexed suffix`);
      return legacyBlock;
    }
    const lookbackStart =
      cursor > this.config.reorgLookbackBlocks
        ? cursor - this.config.reorgLookbackBlocks
        : this.config.startBlock;
    const earliest = lookbackStart < this.config.startBlock ? this.config.startBlock : lookbackStart;
    const stored = this.store.blockHashesSince(earliest);

    for (const checkpoint of stored) {
      if (checkpoint.blockNumber > finalizedHead) continue;
      const canonical = await this.client.getBlock({ blockNumber: checkpoint.blockNumber });
      if (
        checkpoint.blockHash === "" ||
        canonical.hash === null ||
        canonical.hash.toLowerCase() !== checkpoint.blockHash.toLowerCase()
      ) {
        this.store.rewindFrom(checkpoint.blockNumber);
        this.log(`canonical block changed at ${checkpoint.blockNumber}; replaying indexed suffix`);
        return checkpoint.blockNumber;
      }
    }
    return cursor;
  }

  private async ingestRange(address: `0x${string}`, fromBlock: bigint, toBlock: bigint): Promise<void> {
    const payments = await this.client.getLogs({ address, event: paymentSent, fromBlock, toBlock });

    for (const log of payments) {
      const a = log.args;
      if (a.receiptNo === undefined || !a.payer || !a.payee || a.amount === undefined) continue;
      this.store.upsertPayout({
        receipt_no: Number(a.receiptNo),
        payer: a.payer,
        payee: a.payee,
        amount: a.amount.toString(),
        // Payer metadata is deliberately not indexed: it never leaves the
        // encrypted client vault or enters public transaction data.
        label: "",
        memo: "",
        category: "Payout",
        passport_eligible: a.passportEligible ?? false,
        timestamp: Number(a.timestamp ?? 0n),
        tx_hash: log.transactionHash ?? "",
        block_number: Number(log.blockNumber ?? 0n),
        block_hash: log.blockHash ?? "",
      });
    }

    if (payments.length > 0) {
      this.log(`indexed ${fromBlock}–${toBlock}: ${payments.length} payouts`);
    }
  }
}
