import { describe, expect, it } from "vitest";
import { parseRoute, signInHref, signInPath, GATED } from "./router.ts";

describe("parseRoute", () => {
  it("opens documentation and chapter links without an account", () => {
    expect(parseRoute("/docs")).toEqual({ name: "docs", section: "overview" });
    expect(parseRoute("/docs/privacy")).toEqual({ name: "docs", section: "privacy" });
    expect(GATED.has("docs")).toBe(false);
  });

  it("parses the landing page and its in-page anchors", () => {
    expect(parseRoute("/")).toEqual({ name: "landing", anchor: null });
    expect(parseRoute("/#passport")).toEqual({ name: "landing", anchor: "passport" });
    expect(parseRoute("/#why")).toEqual({ name: "landing", anchor: "why" });
  });

  it("keeps old shared hash links compatible", () => {
    expect(parseRoute("#/app")).toEqual({ name: "home" });
    expect(parseRoute("#/r/42")).toEqual({ name: "receipt", receiptNo: 42 });
  });

  it("parses primary gated routes", () => {
    expect(parseRoute("/app")).toEqual({ name: "home" });
    expect(parseRoute("/pay")).toEqual({ name: "pay", to: null, amount: null, memo: null });
    expect(parseRoute("/pay?to=Maria&amount=400&memo=October")).toEqual({
      name: "pay",
      to: "Maria",
      amount: "400",
      memo: "October",
    });
    expect(parseRoute("/books")).toEqual({ name: "books" });
    expect(parseRoute("/passport")).toEqual({ name: "passport" });
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

  it("parses sign-in options and rejects external redirects", () => {
    expect(parseRoute("/signin")).toEqual({ name: "signin", mode: "create", email: null, next: "/app" });
    expect(parseRoute("/signin?mode=signin&email=maria@example.com&next=/books")).toEqual({
      name: "signin",
      mode: "signin",
      email: "maria@example.com",
      next: "/books",
    });
    expect(parseRoute("/signin?next=https://evil.com")).toEqual({
      name: "signin",
      mode: "create",
      email: null,
      next: "/app",
    });
    expect(parseRoute("/signin?next=//evil.com")).toEqual({
      name: "signin",
      mode: "create",
      email: null,
      next: "/app",
    });
  });

  it("parses public records and rejects malformed paths", () => {
    const address = "0x1234567890123456789012345678901234567890";
    expect(parseRoute("/r/1")).toEqual({ name: "receipt", receiptNo: 1 });
    expect(parseRoute(`/p/${address.toUpperCase()}`)).toEqual({
      name: "public-passport",
      address: address.toLowerCase(),
    });
    expect(parseRoute("/r/0")).toEqual({ name: "not-found" });
    expect(parseRoute("/p/not-an-address")).toEqual({ name: "not-found" });
    expect(parseRoute("/does-not-exist")).toEqual({ name: "not-found" });
  });
});

describe("signInHref", () => {
  it("builds a clean sign-in URL with mode, email, and next", () => {
    expect(signInHref()).toBe("/signin");
    expect(signInHref({ mode: "signin" })).toBe("/signin?mode=signin");
    expect(signInHref({ mode: "create", email: "user@remi.so", next: "/passport" })).toBe(
      "/signin?mode=create&email=user%40remi.so&next=%2Fpassport",
    );
  });

  it("keeps a base-free path available for programmatic navigation", () => {
    expect(signInPath({ mode: "signin", next: "/books" })).toBe("/signin?mode=signin&next=%2Fbooks");
  });
});
