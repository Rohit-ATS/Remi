import { describe, expect, it } from "vitest";
import { parseRoute, signInHref, GATED } from "./router.ts";

describe("parseRoute", () => {
  it("opens documentation and chapter links without an account", () => {
    expect(parseRoute("#/docs")).toEqual({ name: "docs", section: "overview" });
    expect(parseRoute("#/docs/privacy")).toEqual({ name: "docs", section: "privacy" });
    expect(GATED.has("docs")).toBe(false);
  });
  it("parses landing page without anchor", () => {
    expect(parseRoute("")).toEqual({ name: "landing", anchor: null });
    expect(parseRoute("#")).toEqual({ name: "landing", anchor: null });
    expect(parseRoute("#/")).toEqual({ name: "landing", anchor: null });
  });

  it("parses landing page in-page anchors", () => {
    expect(parseRoute("#passport")).toEqual({ name: "landing", anchor: "passport" });
    expect(parseRoute("#why")).toEqual({ name: "landing", anchor: "why" });
    expect(parseRoute("#payouts")).toEqual({ name: "landing", anchor: "payouts" });
  });

  it("parses primary gated routes", () => {
    expect(parseRoute("#/app")).toEqual({ name: "home" });
    expect(parseRoute("#/pay")).toEqual({ name: "pay", to: null, amount: null, memo: null });
    expect(parseRoute("#/pay?to=Maria&amount=400&memo=October")).toEqual({
      name: "pay",
      to: "Maria",
      amount: "400",
      memo: "October",
    });
    expect(parseRoute("#/books")).toEqual({ name: "books" });
    expect(parseRoute("#/passport")).toEqual({ name: "passport" });
  });

  it("identifies gated routes in GATED set", () => {
    expect(GATED.has("home")).toBe(true);
    expect(GATED.has("pay")).toBe(true);
    expect(GATED.has("books")).toBe(true);
    expect(GATED.has("passport")).toBe(true);
    expect(GATED.has("landing")).toBe(false);
    expect(GATED.has("signin")).toBe(false);
    expect(GATED.has("receipt")).toBe(false);
    expect(GATED.has("public-passport")).toBe(false);
  });

  it("parses signin route with defaults and query params", () => {
    expect(parseRoute("#/signin")).toEqual({
      name: "signin",
      mode: "create",
      email: null,
      next: "/app",
    });

    expect(parseRoute("#/signin?mode=signin&email=maria@example.com&next=/books")).toEqual({
      name: "signin",
      mode: "signin",
      email: "maria@example.com",
      next: "/books",
    });
  });

  it("protects signin next redirect from external open redirects", () => {
    expect(parseRoute("#/signin?next=https://evil.com")).toEqual({
      name: "signin",
      mode: "create",
      email: null,
      next: "/app",
    });

    expect(parseRoute("#/signin?next=//evil.com")).toEqual({
      name: "signin",
      mode: "create",
      email: null,
      next: "/app",
    });

    expect(parseRoute("#/signin?next=javascript:alert(1)")).toEqual({
      name: "signin",
      mode: "create",
      email: null,
      next: "/app",
    });
  });

  it("parses receipt route with positive integer receipt number", () => {
    expect(parseRoute("#/r/1")).toEqual({ name: "receipt", receiptNo: 1 });
    expect(parseRoute("#/r/42")).toEqual({ name: "receipt", receiptNo: 42 });
  });

  it("falls back to landing for invalid receipt numbers", () => {
    expect(parseRoute("#/r/0")).toEqual({ name: "landing", anchor: null });
    expect(parseRoute("#/r/-5")).toEqual({ name: "landing", anchor: null });
    expect(parseRoute("#/r/abc")).toEqual({ name: "landing", anchor: null });
  });

  it("parses public passport route with 20-byte hex address", () => {
    const address = "0x1234567890123456789012345678901234567890";
    expect(parseRoute(`#/p/${address}`)).toEqual({
      name: "public-passport",
      address: address.toLowerCase(),
    });
    expect(parseRoute(`#/p/${address.toUpperCase()}`)).toEqual({
      name: "public-passport",
      address: address.toLowerCase(),
    });
  });

  it("falls back to landing for malformed public passport addresses", () => {
    expect(parseRoute("#/p/not-an-address")).toEqual({ name: "landing", anchor: null });
    expect(parseRoute("#/p/0x1234")).toEqual({ name: "landing", anchor: null });
  });
});

describe("signInHref", () => {
  it("builds sign-in URL with mode, email, and next", () => {
    expect(signInHref()).toBe("#/signin");
    expect(signInHref({ mode: "signin" })).toBe("#/signin?mode=signin");
    expect(signInHref({ mode: "create", email: "user@remi.so", next: "/passport" })).toBe(
      "#/signin?mode=create&email=user%40remi.so&next=%2Fpassport",
    );
  });
});
