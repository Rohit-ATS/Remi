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
  rpcUrl: string;
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
  corsOrigins: string[];
  assistant: {
    maxRequests: number;
    maxRequestsPerKey: number;
    windowMs: number;
    maxConcurrent: number;
    maxBuckets: number;
  };
  kimi: { apiKey: string | null; enabled: boolean; baseUrl: string; model: string };
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

  return {
    port: int(env.PORT, 8787),
    host: env.HOST ?? "127.0.0.1",
    // Render terminates TLS before forwarding to this process, so req.ip can
    // remain usable for the assistant rate limit there.
    trustProxy: env.TRUST_PROXY === "true",
    network,
    chain,
    rpcUrl: env.RPC_URL ?? chain.rpcUrls.default.http[0],
    payoutsAddress: address(env.PAYOUTS_ADDRESS),
    tokenAddress: address(env.TOKEN_ADDRESS),
    startBlock: BigInt(env.START_BLOCK ?? "0"),
    dbPath: env.DB_PATH ?? "remi.db",
    pollMs: int(env.POLL_MS, network === "local" ? 500 : 2000),
    logChunk: BigInt(env.LOG_CHUNK ?? "2000"),
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
      apiKey: env.KIMI_API_KEY ?? null,
      // A public deployment must opt in after placing an edge rate limit and
      // a provider budget around it. A key alone never enables paid calls.
      enabled: env.KIMI_REMOTE_ENABLED === "true",
      baseUrl: env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
      model: env.KIMI_MODEL ?? "kimi-k2-0905-preview",
    },
  };
}
