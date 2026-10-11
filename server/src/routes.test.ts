import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePayoutLimit } from "./routes.ts";

test("payout pagination rejects negative, fractional and non-numeric limits", () => {
  for (const value of ["-1", "0", "1.5", "Infinity", "nope"]) {
    assert.equal(parsePayoutLimit(value), null, value);
  }
});

test("payout pagination has a bounded default and maximum", () => {
  assert.equal(parsePayoutLimit(undefined), 100);
  assert.equal(parsePayoutLimit("1"), 1);
  assert.equal(parsePayoutLimit("999999"), 500);
});
