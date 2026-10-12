// HTTP surface. Nothing here holds a key or signs anything: payouts are sent
// from the browser by the payer's own passkey session. The server reads the
// chain, aggregates, and narrates.

import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { Config } from "./config.ts";
import type { Store } from "./db.ts";
import type { Indexer } from "./indexer.ts";
import { buildBooks, toCsv, CATEGORIES } from "./books.ts";
import { buildDashboard } from "./dashboard.ts";
import { assess } from "./underwriting.ts";
import { answer } from "./assistant.ts";
import { AssistantGuard } from "./assistant-guard.ts";
import { fund } from "./faucet.ts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_PAYOUTS = 500;

/** Parses the public pagination parameter without SQLite's negative-LIMIT semantics. */
export function parsePayoutLimit(value: string | undefined): number | null {
  if (value === undefined || value === "") return 100;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_PAYOUTS);
}

/**
 * Remote-model authorization is an operator-to-API credential, not a browser
 * credential. The public SPA never receives it; an authenticated edge injects
 * it after applying its own global admission controls.
 */
export function hasAssistantEdgeToken(
  provided: string | string[] | undefined,
  expected: string | null,
): boolean {
  if (expected === null || typeof provided !== "string") return false;
  const candidate = Buffer.from(provided);
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
}

export function registerRoutes(
  app: FastifyInstance,
  config: Config,
  store: Store,
  indexer: Indexer,
): void {
  // Public fallback requests and edge-authenticated remote requests must not
  // compete for the same small instance budget. The edge token is checked
  // before the latter guard is acquired, so a direct caller cannot starve the
  // optional paid-assistant path without possessing that operator credential.
  const remoteAssistantGuard = new AssistantGuard(config.assistant);
  const fallbackAssistantGuard = new AssistantGuard(config.assistant);

  app.get("/api/health", async () => {
    const indexerStatus = indexer.getStatus();
    return {
      ok: true,
      network: config.network,
      chainId: config.chain.id,
      payoutsAddress: config.payoutsAddress,
      tokenAddress: config.tokenAddress,
      explorer: config.chain.blockExplorers?.default.url ?? null,
      categories: CATEGORIES,
      assistant: config.kimi.apiKey === null || !config.kimi.enabled ? "local" : "kimi",
      counts: store.counts(),
      // Indexer errors can include a provider URL (and its credential). Keep
      // detailed diagnostics in server logs, but never serialize them to this
      // unauthenticated endpoint.
      indexer: {
        ...indexerStatus,
        lastError: indexerStatus.lastError === null ? null : "Indexer error; check server logs.",
      },
    };
  });

  /** Public config. `publicRpcUrl` is intentionally separate from the indexer's RPC_URL. */
  app.get("/api/config", async () => ({
    network: config.network,
    chainId: config.chain.id,
    rpcUrl: config.publicRpcUrl,
    payoutsAddress: config.payoutsAddress,
    tokenAddress: config.tokenAddress,
    explorer: config.chain.blockExplorers?.default.url ?? null,
    categories: CATEGORIES,
    faucet: config.network === "local" && config.devMintKey !== null,
  }));

  /**
   * Local-chain faucet. Gated twice: the route refuses off a local chain, and
   * `fund` checks again before it signs anything.
   */
  app.post<{ Body: { address?: string } }>("/api/dev/fund", async (req, reply) => {
    if (config.network !== "local") {
      return reply.code(404).send({ error: "not found" });
    }
    const address = req.body?.address;
    if (!address || !ADDRESS.test(address)) {
      return reply.code(400).send({ error: "address must be a 20-byte hex address" });
    }
    try {
      return await fund(config, address as `0x${string}`);
    } catch (error) {
      return reply
        .code(500)
        .send({ error: error instanceof Error ? error.message : "could not fund that account" });
    }
  });

  // --- payer side ----------------------------------------------------------

  app.get<{ Querystring: { owner?: string; limit?: string } }>("/api/payouts", async (req, reply) => {
    const owner = req.query.owner;
    if (!owner || !ADDRESS.test(owner)) {
      return reply.code(400).send({ error: "owner must be a 20-byte hex address" });
    }
    const limit = parsePayoutLimit(req.query.limit);
    if (limit === null) {
      return reply.code(400).send({ error: "limit must be a positive integer" });
    }
    return { payouts: store.payoutsByPayer(owner, limit) };
  });

  /** Everything the first screen needs, in one round trip. */
  app.get<{ Querystring: { owner?: string } }>("/api/dashboard", async (req, reply) => {
    const owner = req.query.owner;
    if (!owner || !ADDRESS.test(owner)) {
      return reply.code(400).send({ error: "owner must be a 20-byte hex address" });
    }
    const payouts = store.payoutsByPayer(owner, 500);
    return buildDashboard(payouts, new Set(payouts.map((payout) => payout.payee)).size);
  });

  app.get<{ Querystring: { owner?: string; month?: string } }>("/api/books", async (req, reply) => {
    const owner = req.query.owner;
    if (!owner || !ADDRESS.test(owner)) {
      return reply.code(400).send({ error: "owner must be a 20-byte hex address" });
    }
    const month = req.query.month;
    if (month !== undefined && !/^\d{4}-\d{2}$/.test(month)) {
      return reply.code(400).send({ error: "month must look like 2026-10" });
    }
    return buildBooks(store.payoutsByPayer(owner, 500), month);
  });

  app.get<{ Querystring: { owner?: string } }>("/api/books.csv", async (req, reply) => {
    const owner = req.query.owner;
    if (!owner || !ADDRESS.test(owner)) {
      return reply.code(400).send({ error: "owner must be a 20-byte hex address" });
    }
    const csv = toCsv(store.payoutsByPayer(owner, 500));
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="remi-payouts.csv"`)
      .send(csv);
  });

  // --- public: the recipient's receipt, opened with no account -------------

  app.get<{ Params: { receiptNo: string } }>("/api/receipt/:receiptNo", async (req, reply) => {
    const n = Number(req.params.receiptNo);
    if (!Number.isInteger(n) || n <= 0) {
      return reply.code(400).send({ error: "receipt number must be a positive integer" });
    }
    const payout = store.payoutByReceipt(n);
    if (!payout) return reply.code(404).send({ error: "no such receipt" });

    const explorer = config.chain.blockExplorers?.default.url ?? null;
    return {
      receipt: payout,
      verifyUrl: explorer ? `${explorer}/tx/${payout.tx_hash}` : null,
    };
  });

  // --- the Passport: a payee's own income record ---------------------------

  app.get<{ Params: { address: string } }>("/api/passport/:address", async (req, reply) => {
    const address = req.params.address;
    if (!ADDRESS.test(address)) {
      return reply.code(400).send({ error: "address must be a 20-byte hex address" });
    }
    const rows = store.payoutsByPayee(address, 500).filter((row) => row.passport_eligible);
    const assessment = assess(rows);
    if (config.network !== "mainnet") {
      // DemoUSD is freely mintable. Testnet and local histories can demonstrate
      // the product flow, but must never present a credit-facing score.
      assessment.stabilityScore = 0;
      assessment.advanceCeiling = "0";
      assessment.reasons.unshift(
        "Testnet and local records are demonstrations only and cannot support underwriting.",
      );
    }
    return {
      address: address.toLowerCase(),
      assessment,
      payouts: rows,
    };
  });

  // --- the assistant: read-only over the payer's own rows ------------------

  app.post<{ Body: { owner?: string; question?: string } }>("/api/assistant", async (req, reply) => {
    const { owner, question } = req.body ?? {};
    if (!owner || !ADDRESS.test(owner)) {
      return reply.code(400).send({ error: "owner must be a 20-byte hex address" });
    }
    if (typeof question !== "string" || question.trim().length === 0) {
      return reply.code(400).send({ error: "question is required" });
    }
    if (question.length > 500) {
      return reply.code(400).send({ error: "question must be 500 characters or fewer" });
    }
    const dailyRequestLimit = config.kimi.dailyRequestLimit;
    const edgeAuthorized =
      config.kimi.enabled &&
      dailyRequestLimit !== null &&
      hasAssistantEdgeToken(req.headers["x-remi-assistant-token"], config.kimi.edgeToken);
    // `owner` is public, caller-controlled input, not authentication. It must
    // not form part of the rate-limit identity or callers can rotate wallets.
    const release = (edgeAuthorized ? remoteAssistantGuard : fallbackAssistantGuard).acquire(req.ip);
    if (release === null) {
      return reply.code(429).send({ error: "assistant is busy; try again shortly" });
    }
    try {
      const rows = store.payoutsByPayer(owner, 500);
      const canUseRemote =
        edgeAuthorized &&
        dailyRequestLimit !== null &&
        store.consumeAssistantBudget(new Date().toISOString().slice(0, 10), dailyRequestLimit);
      // Requests that did not pass the operator edge, or that hit the durable
      // daily cap, retain the useful deterministic local response rather than
      // exposing a paid provider to an unauthenticated browser.
      const answerConfig = canUseRemote
        ? config
        : { ...config, kimi: { ...config.kimi, enabled: false } };
      return await answer(question.trim(), rows, answerConfig);
    } finally {
      release();
    }
  });
}
