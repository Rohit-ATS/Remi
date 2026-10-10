// The index. Node's built-in SQLite, so the server has no native dependency.
//
// Amounts are stored as TEXT holding integer minor units (6 decimals for AUSD).
// SQLite integers are 64-bit and JS numbers are not, so money never becomes a
// float anywhere between the chain and the client.

import { DatabaseSync } from "node:sqlite";

export type PayoutRow = {
  receipt_no: number;
  payer: string;
  payee: string;
  amount: string;
  label: string;
  memo: string;
  category: string;
  timestamp: number;
  tx_hash: string;
  block_number: number;
};

export type PayeeRow = {
  payer: string;
  label: string;
  wallet: string;
  country: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS payouts (
  receipt_no   INTEGER PRIMARY KEY,
  payer        TEXT NOT NULL,
  payee        TEXT NOT NULL,
  amount       TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  memo         TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'Other',
  timestamp    INTEGER NOT NULL,
  tx_hash      TEXT NOT NULL,
  block_number INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payouts_payer ON payouts (payer, timestamp DESC);
CREATE INDEX IF NOT EXISTS payouts_payee ON payouts (payee, timestamp DESC);

CREATE TABLE IF NOT EXISTS payees (
  payer   TEXT NOT NULL,
  label   TEXT NOT NULL,
  wallet  TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (payer, label)
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // --- indexer bookkeeping -------------------------------------------------

  getCursor(fallback: bigint): bigint {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'cursor'").get() as
      | { value: string }
      | undefined;
    return row ? BigInt(row.value) : fallback;
  }

  setCursor(block: bigint): void {
    this.db
      .prepare("INSERT INTO meta (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(block.toString());
  }

  // --- writes --------------------------------------------------------------

  /** Idempotent: re-indexing the same log is a no-op, so a restart cannot double-count. */
  upsertPayout(p: PayoutRow): void {
    this.db
      .prepare(
        `INSERT INTO payouts (receipt_no, payer, payee, amount, label, memo, category, timestamp, tx_hash, block_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(receipt_no) DO UPDATE SET
           payer = excluded.payer, payee = excluded.payee, amount = excluded.amount,
           label = excluded.label, memo = excluded.memo, category = excluded.category,
           timestamp = excluded.timestamp, tx_hash = excluded.tx_hash, block_number = excluded.block_number`,
      )
      .run(
        p.receipt_no,
        p.payer.toLowerCase(),
        p.payee.toLowerCase(),
        p.amount,
        p.label,
        p.memo,
        p.category,
        p.timestamp,
        p.tx_hash,
        p.block_number,
      );
  }

  upsertPayee(p: PayeeRow): void {
    this.db
      .prepare(
        `INSERT INTO payees (payer, label, wallet, country) VALUES (?, ?, ?, ?)
         ON CONFLICT(payer, label) DO UPDATE SET wallet = excluded.wallet, country = excluded.country`,
      )
      .run(p.payer.toLowerCase(), p.label, p.wallet.toLowerCase(), p.country);
  }

  // --- reads ---------------------------------------------------------------

  payoutsByPayer(payer: string, limit = 200): PayoutRow[] {
    return this.db
      .prepare("SELECT * FROM payouts WHERE payer = ? ORDER BY timestamp DESC, receipt_no DESC LIMIT ?")
      .all(payer.toLowerCase(), limit) as PayoutRow[];
  }

  payoutsByPayee(payee: string, limit = 200): PayoutRow[] {
    return this.db
      .prepare("SELECT * FROM payouts WHERE payee = ? ORDER BY timestamp DESC, receipt_no DESC LIMIT ?")
      .all(payee.toLowerCase(), limit) as PayoutRow[];
  }

  payoutByReceipt(receiptNo: number): PayoutRow | undefined {
    return this.db.prepare("SELECT * FROM payouts WHERE receipt_no = ?").get(receiptNo) as
      | PayoutRow
      | undefined;
  }

  payeesByPayer(payer: string): PayeeRow[] {
    return this.db
      .prepare("SELECT * FROM payees WHERE payer = ? ORDER BY label")
      .all(payer.toLowerCase()) as PayeeRow[];
  }

  counts(): { payouts: number; payees: number } {
    const p = this.db.prepare("SELECT COUNT(*) AS n FROM payouts").get() as { n: number };
    const q = this.db.prepare("SELECT COUNT(*) AS n FROM payees").get() as { n: number };
    return { payouts: p.n, payees: q.n };
  }
}
