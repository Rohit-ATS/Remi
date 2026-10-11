import { test } from "node:test";
import assert from "node:assert/strict";
import { AssistantGuard } from "./assistant-guard.ts";

test("assistant guard caps a caller and resets its window", () => {
  const guard = new AssistantGuard({
    maxRequests: 10,
    maxRequestsPerKey: 2,
    windowMs: 1_000,
    maxConcurrent: 3,
    maxBuckets: 10,
  });
  const a = guard.acquire("ip:owner", 100);
  const b = guard.acquire("ip:owner", 200);
  assert.ok(a);
  assert.ok(b);
  assert.equal(guard.acquire("ip:owner", 300), null);
  a!();
  b!();
  const next = guard.acquire("ip:owner", 1_100);
  assert.ok(next);
  next!();
});

test("assistant guard bounds concurrent upstream calls", () => {
  const guard = new AssistantGuard({
    maxRequests: 10,
    maxRequestsPerKey: 10,
    windowMs: 1_000,
    maxConcurrent: 1,
    maxBuckets: 10,
  });
  const first = guard.acquire("first", 100);
  assert.ok(first);
  assert.equal(guard.acquire("second", 100), null);
  first!();
  const second = guard.acquire("second", 100);
  assert.ok(second);
  second!();
});

test("assistant guard has a global budget and expires caller buckets", () => {
  const guard = new AssistantGuard({
    maxRequests: 2,
    maxRequestsPerKey: 2,
    windowMs: 1_000,
    maxConcurrent: 3,
    maxBuckets: 2,
  });
  const first = guard.acquire("first", 100);
  const second = guard.acquire("second", 100);
  assert.ok(first);
  assert.ok(second);
  assert.equal(guard.acquire("third", 100), null, "global budget caps owner rotation");
  first!();
  second!();
  const afterWindow = guard.acquire("third", 1_100);
  assert.ok(afterWindow, "expired buckets are pruned before a new caller is admitted");
  afterWindow!();
});
