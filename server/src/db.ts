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
  passport_eligible: boolean;
  timestamp: number;
  tx_hash: string;
  block_number: number;
  /** Canonical block identity used to discard reorged rows on replay. */
  block_hash: string;
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
  passport_eligible INTEGER NOT NULL DEFAULT 0,
  timestamp    INTEGER NOT NULL,
  tx_hash      TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS payouts_payer ON payouts (payer, timestamp DESC);
CREATE INDEX IF NOT EXISTS payouts_payee ON payouts (payee, timestamp DESC);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_budget (
  day   TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);
`;

function mapRow(raw: unknown): PayoutRow {
  const r = raw as PayoutRow;
  return {
    ...r,
    passport_eligible: Boolean(r.passport_eligible),
  };
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
    // V1 stored payer-supplied country strings in this local projection. V2
    // never writes them, so remove the retired table rather than retaining PII.
    this.db.exec("DROP TABLE IF EXISTS payees");
    // Existing development databases predate attested Passport rows.
    const columns = this.db.prepare("PRAGMA table_info(payouts)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "passport_eligible")) {
      this.db.exec("ALTER TABLE payouts ADD COLUMN passport_eligible INTEGER NOT NULL DEFAULT 0");
    }
    if (!columns.some((column) => column.name === "block_hash")) {
      // Empty hashes deliberately force the indexer to replay legacy rows before
      // serving them as canonical data.
      this.db.exec("ALTER TABLE payouts ADD COLUMN block_hash TEXT NOT NULL DEFAULT ''");
    }
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

  /** Stored block identities within a bounded reconciliation window. */
  blockHashesSince(block: bigint): { blockNumber: bigint; blockHash: string }[] {
    const rows = this.db
      .prepare(
        "SELECT block_number, block_hash FROM payouts WHERE block_number >= ? GROUP BY block_number, block_hash ORDER BY block_number ASC",
      )
      .all(Number(block)) as { block_number: number; block_hash: string }[];
    return rows.map((row) => ({ blockNumber: BigInt(row.block_number), blockHash: row.block_hash }));
  }

  /** Legacy rows cannot be treated as canonical until their block hash is replayed. */
  firstMissingBlockHash(): bigint | null {
    const row = this.db
      .prepare("SELECT block_number FROM payouts WHERE block_hash = '' ORDER BY block_number ASC LIMIT 1")
      .get() as { block_number: number } | undefined;
    return row ? BigInt(row.block_number) : null;
  }

  /** Removes a non-canonical suffix and atomically moves the replay cursor. */
  rewindFrom(block: bigint): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM payouts WHERE block_number >= ?").run(Number(block));
      this.setCursor(block);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * A persistent provider-call ceiling. It is deliberately atomic: competing
   * requests cannot both observe the same final remaining slot.
   */
  consumeAssistantBudget(day: string, limit: number): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO assistant_budget (day, count) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ?`,
      )
      .run(day, limit);
    return result.changes === 1;
  }

  /** Starts a fresh index when the configured contract changes. Receipt numbers
   * restart at one for a new deployment, so mixing contracts would corrupt the
   * local projection and retain metadata from the retired contract. */
  selectPayoutContract(address: string): boolean {
    const normalized = address.toLowerCase();
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'payouts_address'").get() as
      | { value: string }
      | undefined;
    if (row?.value === normalized) return false;
    this.db.exec("DELETE FROM payouts");
    this.db.prepare("DELETE FROM meta WHERE key IN ('cursor', 'payouts_address')").run();
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('payouts_address', ?)").run(normalized);
    return true;
  }

  // --- writes --------------------------------------------------------------

  /** Idempotent: re-indexing the same log is a no-op, so a restart cannot double-count. */
  upsertPayout(p: PayoutRow): void {
    this.db
      .prepare(
        `INSERT INTO payouts (receipt_no, payer, payee, amount, label, memo, category, passport_eligible, timestamp, tx_hash, block_number, block_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(receipt_no) DO UPDATE SET
           payer = excluded.payer, payee = excluded.payee, amount = excluded.amount,
           label = excluded.label, memo = excluded.memo, category = excluded.category,
           passport_eligible = excluded.passport_eligible,
           timestamp = excluded.timestamp, tx_hash = excluded.tx_hash, block_number = excluded.block_number,
           block_hash = excluded.block_hash`,
      )
      .run(
        p.receipt_no,
        p.payer.toLowerCase(),
        p.payee.toLowerCase(),
        p.amount,
        p.label,
        p.memo,
        p.category,
        p.passport_eligible ? 1 : 0,
        p.timestamp,
        p.tx_hash,
        p.block_number,
        p.block_hash,
      );
  }

  // --- reads ---------------------------------------------------------------

  payoutsByPayer(payer: string, limit = 200): PayoutRow[] {
    const bounded = Math.max(1, Math.min(Math.floor(limit), 500));
    const rows = this.db
      .prepare("SELECT * FROM payouts WHERE payer = ? ORDER BY timestamp DESC, receipt_no DESC LIMIT ?")
      .all(payer.toLowerCase(), bounded);
    return rows.map(mapRow);
  }

  payoutsByPayee(payee: string, limit = 200): PayoutRow[] {
    const bounded = Math.max(1, Math.min(Math.floor(limit), 500));
    const rows = this.db
      .prepare("SELECT * FROM payouts WHERE payee = ? ORDER BY timestamp DESC, receipt_no DESC LIMIT ?")
      .all(payee.toLowerCase(), bounded);
    return rows.map(mapRow);
  }

  payoutByReceipt(receiptNo: number): PayoutRow | undefined {
    const row = this.db.prepare("SELECT * FROM payouts WHERE receipt_no = ?").get(receiptNo);
    return row ? mapRow(row) : undefined;
  }

  counts(): { payouts: number } {
    const p = this.db.prepare("SELECT COUNT(*) AS n FROM payouts").get() as { n: number };
    return { payouts: p.n };
  }
}
