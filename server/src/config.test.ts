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
