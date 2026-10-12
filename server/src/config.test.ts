import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.ts";

test("config: remote Kimi fails closed without edge authorization and a durable budget", () => {
  assert.throws(
    () => loadConfig({ KIMI_REMOTE_ENABLED: "true", KIMI_API_KEY: "provider-key" }),
    /ASSISTANT_EDGE_TOKEN.*KIMI_DAILY_REQUEST_LIMIT/,
  );

  const config = loadConfig({
    KIMI_REMOTE_ENABLED: "true",
    KIMI_API_KEY: "provider-key",
    ASSISTANT_EDGE_TOKEN: "edge-secret",
    KIMI_DAILY_REQUEST_LIMIT: "25",
  });
  assert.equal(config.kimi.enabled, true);
  assert.equal(config.kimi.dailyRequestLimit, 25);
  assert.equal(config.kimi.edgeToken, "edge-secret");
});

test("config: indexer rejects a zero-size log chunk and chooses safe finality defaults", () => {
  assert.throws(() => loadConfig({ LOG_CHUNK: "0" }), /LOG_CHUNK must be a positive integer/);
  assert.equal(loadConfig({ NETWORK: "local" }).finalityBlocks, 0n);
  assert.equal(loadConfig({ NETWORK: "testnet" }).finalityBlocks, 2n);
  assert.equal(loadConfig({ NETWORK: "mainnet" }).finalityBlocks, 12n);
  assert.throws(
    () => loadConfig({ INDEX_FINALITY_BLOCKS: "10", REORG_LOOKBACK_BLOCKS: "9" }),
    /REORG_LOOKBACK_BLOCKS must be at least INDEX_FINALITY_BLOCKS/,
  );
});

test("config: public RPC never inherits the server-only RPC_URL", () => {
  const config = loadConfig({
    NETWORK: "testnet",
    RPC_URL: "https://provider.example/v1/server-secret",
  });
  assert.equal(config.rpcUrl, "https://provider.example/v1/server-secret");
  assert.equal(config.publicRpcUrl, "https://testnet-rpc.monad.xyz");

  const configured = loadConfig({
    NETWORK: "testnet",
    RPC_URL: "https://provider.example/v1/server-secret",
    PUBLIC_RPC_URL: "https://public-rpc.example",
  });
  assert.equal(configured.publicRpcUrl, "https://public-rpc.example");

  const blank = loadConfig({
    NETWORK: "testnet",
    RPC_URL: "",
    PUBLIC_RPC_URL: "   ",
  });
  assert.equal(blank.rpcUrl, "https://testnet-rpc.monad.xyz");
  assert.equal(blank.publicRpcUrl, "https://testnet-rpc.monad.xyz");

  assert.throws(
    () =>
      loadConfig({
        NETWORK: "testnet",
        RPC_URL: "https://provider.example/v1/server-secret",
        PUBLIC_RPC_URL: "https://provider.example/v1/server-secret",
      }),
    /PUBLIC_RPC_URL must not match RPC_URL/,
  );

  assert.throws(
    () =>
      loadConfig({
        NETWORK: "testnet",
        RPC_URL: "https://provider.example/v1/server-secret#server",
        PUBLIC_RPC_URL: "https://provider.example/v1/server-secret#browser",
      }),
    /PUBLIC_RPC_URL must not match RPC_URL/,
  );
});
