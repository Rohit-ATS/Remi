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
