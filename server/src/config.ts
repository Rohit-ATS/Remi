// Single place where the environment is read. Everything downstream takes a
// typed Config, so no module reaches into process.env on its own.

import { defineChain } from "viem";

export const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://explorer.monad.xyz" } },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});

/**
 * Hardhat's first account. Publicly known by design and worthless off a local
 * chain, so `npm run chain` needs no key setup at all.
 */
const LOCAL_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** The chain `npm run chain` starts. Offline, funded, no faucet. */
export const localChain = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export type Config = {
  port: number;
  host: string;
  trustProxy: boolean;
  network: "mainnet" | "testnet" | "local";
  chain: typeof monadMainnet | typeof monadTestnet | typeof localChain;
  /** Server-only RPC endpoint for indexing and the local faucet. */
  rpcUrl: string;
  /** Browser-safe RPC endpoint intentionally returned from the public config route. */
  publicRpcUrl: string;
  payoutsAddress: `0x${string}` | null;
  tokenAddress: `0x${string}` | null;
  /** Block the contract was deployed in. Indexing from 0 would scan the whole chain. */
  startBlock: bigint;
  dbPath: string;
  devMintKey: string | null;
  /** Poll interval for the indexer, in ms. */
  pollMs: number;
  /** Blocks per getLogs request. RPCs cap this; 2000 is widely safe. */
  logChunk: bigint;
  /** Only index blocks this far behind the head as canonical. */
  finalityBlocks: bigint;
  /** Recheck this many finalized blocks for a rare deeper reorganization. */
  reorgLookbackBlocks: bigint;
  corsOrigins: string[];
  assistant: {
    maxRequests: number;
    maxRequestsPerKey: number;
    windowMs: number;
    maxConcurrent: number;
    maxBuckets: number;
  };
  kimi: {
    apiKey: string | null;
    enabled: boolean;
    baseUrl: string;
    model: string;
    /** A secret injected only by the operator's authenticated edge. */
    edgeToken: string | null;
    /** Durable UTC-day ceiling for paid provider requests. */
    dailyRequestLimit: number | null;
  };
};

function address(value: string | undefined): `0x${string}` | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`expected a 20-byte hex address, got ${JSON.stringify(value)}`);
  }
  return v as `0x${string}`;
}

function int(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`expected a number, got ${JSON.stringify(value)}`);
  return n;
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  const n = int(value, fallback);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

function nonNegativeBigInt(value: string | undefined, fallback: bigint, name: string): bigint {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return BigInt(value.trim());
}

function positiveBigInt(value: string | undefined, fallback: bigint, name: string): bigint {
  const n = nonNegativeBigInt(value, fallback, name);
  if (n <= 0n) throw new Error(`${name} must be a positive integer`);
  return n;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sameUrl(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    // URL fragments never reach an RPC server, so they must not make the
    // same credential-bearing endpoint look different.
    leftUrl.hash = "";
    rightUrl.hash = "";
    return leftUrl.href === rightUrl.href;
  } catch {
    return left === right;
  }
}

function origins(value: string | undefined): string[] {
  const result = (value ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (result.length === 0 || result.some((origin) => !/^https?:\/\//.test(origin))) {
    throw new Error("CORS_ORIGINS must contain one or more http(s) origins");
  }
  return result;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const network =
    env.NETWORK === "mainnet" ? "mainnet" : env.NETWORK === "local" ? "local" : "testnet";
  const chain =
    network === "mainnet" ? monadMainnet : network === "local" ? localChain : monadTestnet;
  const configuredRpcUrl = nonEmpty(env.RPC_URL);
  const configuredPublicRpcUrl = nonEmpty(env.PUBLIC_RPC_URL);
  const rpcUrl = configuredRpcUrl ?? chain.rpcUrls.default.http[0];
  const publicRpcUrl = configuredPublicRpcUrl ?? chain.rpcUrls.default.http[0];
  if (
    configuredRpcUrl !== null &&
    configuredPublicRpcUrl !== null &&
    sameUrl(rpcUrl, publicRpcUrl)
  ) {
    throw new Error("PUBLIC_RPC_URL must not match RPC_URL");
  }
  const kimiEnabled = env.KIMI_REMOTE_ENABLED === "true";
  const kimiApiKey = nonEmpty(env.KIMI_API_KEY);
  const kimiEdgeToken = nonEmpty(env.ASSISTANT_EDGE_TOKEN);
  const kimiDailyRequestLimit =
    env.KIMI_DAILY_REQUEST_LIMIT === undefined || env.KIMI_DAILY_REQUEST_LIMIT === ""
      ? null
      : positiveInt(env.KIMI_DAILY_REQUEST_LIMIT, 1, "KIMI_DAILY_REQUEST_LIMIT");
  const finalityBlocks = nonNegativeBigInt(
    env.INDEX_FINALITY_BLOCKS,
    network === "mainnet" ? 12n : network === "testnet" ? 2n : 0n,
    "INDEX_FINALITY_BLOCKS",
  );
  const reorgLookbackBlocks = positiveBigInt(
    env.REORG_LOOKBACK_BLOCKS,
    128n,
    "REORG_LOOKBACK_BLOCKS",
  );
  if (reorgLookbackBlocks < finalityBlocks) {
    throw new Error("REORG_LOOKBACK_BLOCKS must be at least INDEX_FINALITY_BLOCKS");
  }

  // A browser cannot safely hold an authorization secret. Remote model traffic
  // therefore has to arrive through an operator-controlled edge which both
  // authenticates/rate-limits callers and adds ASSISTANT_EDGE_TOKEN. The local
  // SQLite counter below is the durable backstop for this single-volume API.
  if (kimiEnabled && (kimiApiKey === null || kimiEdgeToken === null || kimiDailyRequestLimit === null)) {
    throw new Error(
      "KIMI_REMOTE_ENABLED requires KIMI_API_KEY, ASSISTANT_EDGE_TOKEN, and KIMI_DAILY_REQUEST_LIMIT",
    );
  }

  return {
    port: int(env.PORT, 8787),
    host: env.HOST ?? "127.0.0.1",
    // Render terminates TLS before forwarding to this process, so req.ip can
    // remain usable for the assistant rate limit there.
    trustProxy: env.TRUST_PROXY === "true",
    network,
    chain,
    rpcUrl,
    // This reaches an unauthenticated browser through /api/config. Never fall
    // back to RPC_URL: operators commonly put provider credentials in it.
    publicRpcUrl,
    payoutsAddress: address(env.PAYOUTS_ADDRESS),
    tokenAddress: address(env.TOKEN_ADDRESS),
    startBlock: nonNegativeBigInt(env.START_BLOCK, 0n, "START_BLOCK"),
    dbPath: env.DB_PATH ?? "remi.db",
    pollMs: int(env.POLL_MS, network === "local" ? 500 : 2000),
    logChunk: positiveBigInt(env.LOG_CHUNK, 2000n, "LOG_CHUNK"),
    finalityBlocks,
    reorgLookbackBlocks,
    corsOrigins: origins(env.CORS_ORIGINS),
    assistant: {
      maxRequests: positiveInt(env.ASSISTANT_RATE_LIMIT, 20, "ASSISTANT_RATE_LIMIT"),
      maxRequestsPerKey: positiveInt(
        env.ASSISTANT_RATE_LIMIT_PER_IP,
        5,
        "ASSISTANT_RATE_LIMIT_PER_IP",
      ),
      windowMs: positiveInt(env.ASSISTANT_RATE_WINDOW_MS, 60_000, "ASSISTANT_RATE_WINDOW_MS"),
      maxConcurrent: positiveInt(env.ASSISTANT_MAX_CONCURRENT, 4, "ASSISTANT_MAX_CONCURRENT"),
      maxBuckets: positiveInt(env.ASSISTANT_MAX_BUCKETS, 10_000, "ASSISTANT_MAX_BUCKETS"),
    },
    /** Dev-only faucet key. Never set outside a local chain. */
    devMintKey: network === "local" ? (env.PRIVATE_KEY ?? LOCAL_DEV_KEY) : null,
    kimi: {
      apiKey: kimiApiKey,
      // A public deployment must opt in after placing an edge rate limit and
      // a provider budget around it. A key alone never enables paid calls.
      enabled: kimiEnabled,
      baseUrl: env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
      model: env.KIMI_MODEL ?? "kimi-k2-0905-preview",
      edgeToken: kimiEdgeToken,
      dailyRequestLimit: kimiDailyRequestLimit,
    },
  };
}
