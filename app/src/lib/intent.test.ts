import { describe, expect, it } from "vitest";
import { parsePaymentIntent } from "./intent.ts";
import { parseAmount, formatAmount, formatUsd, formatExact } from "./money.ts";

const USD = 1_000_000n;

function ok(text: string) {
  const result = parsePaymentIntent(text);
  if (!result.ok) throw new Error(`expected a payout, got: ${result.reason}`);
  return result.intent;
}

describe("money", () => {
  it("parses dollars into minor units", () => {
    expect(parseAmount("400")).toBe(400n * USD);
    expect(parseAmount("400.50")).toBe(400_500_000n);
    expect(parseAmount("$1,250.00")).toBe(1250n * USD);
    expect(parseAmount("0.000001")).toBe(1n);
  });

  it("refuses what it cannot represent exactly", () => {
    expect(parseAmount("400.1234567")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
  });

  it("formats to two places with thousands separators", () => {
    expect(formatAmount(400n * USD)).toBe("400.00");
    expect(formatAmount(1_234_567n * USD)).toBe("1,234,567.00");
    expect(formatUsd(400_500_000n)).toBe("$400.50");
    // Sub-cent remainders are truncated for display, never rounded up.
    expect(formatAmount(400_509_999n)).toBe("400.50");
    expect(formatAmount(-400n * USD)).toBe("-400.00");
    expect(formatAmount(0n)).toBe("0.00");
  });

  it("formatExact shows all 6 decimal places, including negative numbers", () => {
    expect(formatExact(400n * USD)).toBe("400.000000");
    expect(formatExact(1n)).toBe("0.000001");
    expect(formatExact(0n)).toBe("0.000000");
    expect(formatExact(-400n * USD)).toBe("-400.000000");
    expect(formatExact(-500_000n)).toBe("-0.500000");
  });
});

describe("parsePaymentIntent", () => {
  it("reads 'pay <name> <digits>'", () => {
    expect(ok("pay Maria 400")).toEqual({ payee: "Maria", amount: 400n * USD, memo: "" });
    expect(ok("pay Maria $400.50")).toEqual({ payee: "Maria", amount: 400_500_000n, memo: "" });
  });

  it("reads 'send <digits> to <name>'", () => {
    expect(ok("send $400 to Maria")).toEqual({ payee: "Maria", amount: 400n * USD, memo: "" });
  });

  it("reads amounts written as words, in both orders", () => {
    expect(ok("pay Maria four hundred dollars").amount).toBe(400n * USD);
    expect(ok("send four hundred dollars to Maria").amount).toBe(400n * USD);
    expect(ok("pay Ben twenty five dollars").amount).toBe(25n * USD);
    expect(ok("pay Ana one thousand two hundred dollars").amount).toBe(1200n * USD);
    expect(ok("pay Ben fifty dollars").amount).toBe(50n * USD);
  });

  it("keeps the name out of the amount and the amount out of the name", () => {
    expect(ok("pay Maria four hundred dollars").payee).toBe("Maria");
    expect(ok("pay Maria Santos 400").payee).toBe("Maria Santos");
  });

  it("splits a memo introduced by 'for'", () => {
    const intent = ok("pay Maria four hundred dollars for October");
    expect(intent).toEqual({ payee: "Maria", amount: 400n * USD, memo: "October" });
    expect(ok("send $250 to Ben for the logo redesign").memo).toBe("the logo redesign");
  });

  it("does not let a memo swallow the name", () => {
    expect(ok("pay Maria 400 for design work in October").payee).toBe("Maria");
  });

  it("title-cases a lowercase dictated name", () => {
    expect(ok("pay maria 400").payee).toBe("Maria");
  });

  it("routes questions to the assistant even when they contain a verb", () => {
    for (const text of [
      "how much did I pay contractors in September",
      "who is my biggest expense this year",
      "what did I spend on software last month",
      "did I pay Maria yet?",
    ]) {
      const result = parsePaymentIntent(text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.reason, text).toMatch(/question/i);
    }
  });

  it("does not turn a year in a question into an amount", () => {
    // Without the interrogative gate this parses as a $2,026 payout to
    // "Contractors In", which would open a confirm sheet for a question.
    const result = parsePaymentIntent("how much did I pay contractors in 2026");
    expect(result.ok).toBe(false);
  });

  it("refuses an incomplete payout rather than guessing", () => {
    for (const text of ["pay Maria", "pay", "send money to Maria", ""]) {
      expect(parsePaymentIntent(text).ok).toBe(false);
    }
  });

  it("refuses a zero amount", () => {
    expect(parsePaymentIntent("pay Maria 0").ok).toBe(false);
  });

  it("refuses when the name cannot be told from the amount", () => {
    expect(parsePaymentIntent("pay four hundred dollars").ok).toBe(false);
  });

  it("accepts the other payment verbs", () => {
    expect(ok("send Maria 400").amount).toBe(400n * USD);
    expect(ok("transfer $400 to Maria").amount).toBe(400n * USD);
    expect(ok("wire Maria 400").amount).toBe(400n * USD);
  });

  it("handles Unicode names properly", () => {
    expect(ok("pay José 400").payee).toBe("José");
    expect(ok("pay François 100").payee).toBe("François");
  });

  it("handles amounts formatted with commas", () => {
    expect(ok("pay Maria $1,250").amount).toBe(1250n * USD);
    expect(ok("send $2,500.50 to Bob").amount).toBe(2500_500_000n);
  });

  it("handles very large amounts", () => {
    expect(ok("pay Maria $1,000,000,000").amount).toBe(1_000_000_000n * USD);
  });

  it("refuses negative amounts", () => {
    expect(parsePaymentIntent("pay Maria -100").ok).toBe(false);
  });
});
