import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { loadConfig } from "./config.ts";
import { Store } from "./db.ts";
import { hasAssistantEdgeToken, registerRoutes } from "./routes.ts";

test("routes: assistant edge token rejects missing, wrong, and array headers", () => {
  assert.equal(hasAssistantEdgeToken(undefined, "secret"), false);
  assert.equal(hasAssistantEdgeToken("wrong", "secret"), false);
  assert.equal(hasAssistantEdgeToken(["secret"], "secret"), false);
  assert.equal(hasAssistantEdgeToken("secret", "secret"), true);
});

test("routes: public callers cannot trigger a reindex", async () => {
  const app = Fastify();
  const store = new Store(":memory:");
  try {
    registerRoutes(
      app,
      loadConfig({ NETWORK: "local" }),
      store,
      { getStatus: () => ({ running: false, cursor: "0", head: null, finalizedHead: null, lastError: null, lastRunAt: null }) } as any,
    );
    await app.ready();
    const result = await app.inject({ method: "POST", url: "/api/reindex" });
    assert.equal(result.statusCode, 404);
  } finally {
    await app.close();
    store.close();
  }
});

test("routes: public config never discloses the server RPC_URL", async () => {
  const app = Fastify();
  const store = new Store(":memory:");
  const serverRpc = "https://provider.example/v1/server-secret";
  const publicRpc = "https://public-rpc.example";
  try {
    registerRoutes(
      app,
      loadConfig({ NETWORK: "testnet", RPC_URL: serverRpc, PUBLIC_RPC_URL: publicRpc }),
      store,
      { getStatus: () => ({ running: false, cursor: "0", head: null, finalizedHead: null, lastError: null, lastRunAt: null }) } as any,
    );
    await app.ready();

    const result = await app.inject({ method: "GET", url: "/api/config" });
    assert.equal(result.statusCode, 200);
    assert.equal((result.json() as { rpcUrl: string }).rpcUrl, publicRpc);
    assert.equal(result.body.includes(serverRpc), false);
  } finally {
    await app.close();
    store.close();
  }
});

test("routes: health does not disclose indexer error details", async () => {
  const app = Fastify();
  const store = new Store(":memory:");
  const serverRpc = "https://provider.example/v1/server-secret?api-key=also-secret";
  try {
    registerRoutes(
      app,
      loadConfig({ NETWORK: "testnet", RPC_URL: serverRpc }),
      store,
      {
        getStatus: () => ({
          running: true,
          cursor: "0",
          head: null,
          finalizedHead: null,
          lastError: `HTTP request failed for ${serverRpc}`,
          lastRunAt: null,
        }),
      } as any,
    );
    await app.ready();

    const result = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.includes(serverRpc), false);
    assert.equal(
      (result.json() as { indexer: { lastError: string | null } }).indexer.lastError,
      "Indexer error; check server logs.",
    );
  } finally {
    await app.close();
    store.close();
  }
});

test("routes: public fallback traffic cannot consume the edge assistant quota", async () => {
  const app = Fastify();
  const store = new Store(":memory:");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "Edge answer." } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    registerRoutes(
      app,
      loadConfig({
        NETWORK: "local",
        KIMI_REMOTE_ENABLED: "true",
        KIMI_API_KEY: "provider-key",
        ASSISTANT_EDGE_TOKEN: "edge-secret",
        KIMI_DAILY_REQUEST_LIMIT: "10",
        ASSISTANT_RATE_LIMIT: "1",
        ASSISTANT_RATE_LIMIT_PER_IP: "1",
      }),
      store,
      { getStatus: () => ({ running: false, cursor: "0", head: null, finalizedHead: null, lastError: null, lastRunAt: null }) } as any,
    );
    await app.ready();

    const body = { owner: "0x1111111111111111111111111111111111111111", question: "How much?" };
    const fallback = await app.inject({ method: "POST", url: "/api/assistant", payload: body });
    assert.equal(fallback.statusCode, 200);
    assert.equal((fallback.json() as { source: string }).source, "fallback");

    const exhaustedFallback = await app.inject({ method: "POST", url: "/api/assistant", payload: body });
    assert.equal(exhaustedFallback.statusCode, 429);

    const edge = await app.inject({
      method: "POST",
      url: "/api/assistant",
      headers: { "x-remi-assistant-token": "edge-secret" },
      payload: body,
    });
    assert.equal(edge.statusCode, 200);
    assert.equal((edge.json() as { source: string }).source, "model");

    const exhaustedEdge = await app.inject({
      method: "POST",
      url: "/api/assistant",
      headers: { "x-remi-assistant-token": "edge-secret" },
      payload: body,
    });
    assert.equal(exhaustedEdge.statusCode, 429);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    store.close();
  }
});
