// Chain watcher. Polls PaymentSent and PayeeSaved into SQLite.
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
  "event PaymentSent(uint256 indexed receiptNo, address indexed payer, address indexed payee, uint256 amount, string label, string memo, string category, uint64 timestamp)",
);
const payeeSaved = parseAbiItem(
  "event PayeeSaved(address indexed payer, string label, address indexed wallet, string country)",
);

export function makeClient(config: Config): PublicClient {
  return createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) }) as PublicClient;
}

export type IndexerStatus = {
  running: boolean;
  cursor: string;
  head: string | null;
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

      let cursor = this.store.getCursor(this.config.startBlock);
      while (cursor <= head) {
        const to = cursor + this.config.logChunk - 1n > head ? head : cursor + this.config.logChunk - 1n;
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

  private async ingestRange(address: `0x${string}`, fromBlock: bigint, toBlock: bigint): Promise<void> {
    const [payments, payees] = await Promise.all([
      this.client.getLogs({ address, event: paymentSent, fromBlock, toBlock }),
      this.client.getLogs({ address, event: payeeSaved, fromBlock, toBlock }),
    ]);

    for (const log of payees) {
      const a = log.args;
      if (!a.payer || !a.wallet || a.label === undefined) continue;
      this.store.upsertPayee({
        payer: a.payer,
        label: a.label,
        wallet: a.wallet,
        country: a.country ?? "",
      });
    }

    for (const log of payments) {
      const a = log.args;
      if (a.receiptNo === undefined || !a.payer || !a.payee || a.amount === undefined) continue;
      this.store.upsertPayout({
        receipt_no: Number(a.receiptNo),
        payer: a.payer,
        payee: a.payee,
        amount: a.amount.toString(),
        label: a.label ?? "",
        memo: a.memo ?? "",
        category: a.category ?? "Other",
        timestamp: Number(a.timestamp ?? 0n),
        tx_hash: log.transactionHash ?? "",
        block_number: Number(log.blockNumber ?? 0n),
      });
    }

    if (payments.length > 0 || payees.length > 0) {
      this.log(
        `indexed ${fromBlock}–${toBlock}: ${payments.length} payouts, ${payees.length} payees`,
      );
    }
  }
}
