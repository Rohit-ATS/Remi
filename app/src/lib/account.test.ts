import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_CHAIN_KEY,
  clearDemoAccount,
  createDemoAccount,
  demoAccountsAllowed,
  withSession,
} from "./account.ts";

const ACCOUNT_KEY = "remi.account.v1";
const DEMO_KEY = "remi.demo-key.v1";

function installStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("demo accounts", () => {
  it("are only available on local and testnet deployments", () => {
    expect(demoAccountsAllowed("local")).toBe(true);
    expect(demoAccountsAllowed("testnet")).toBe(true);
    expect(demoAccountsAllowed("mainnet")).toBe(false);
    expect(demoAccountsAllowed(null)).toBe(false);
    expect(() => createDemoAccount("Demo", "mainnet")).toThrow(/only available/i);
  });

  it("still creates a labelled demo account on local and testnet", () => {
    const values = installStorage();
    const local = createDemoAccount("Local demo", "local");
    expect(local).toMatchObject({ label: "Local demo", demo: true });
    expect(values.get(DEMO_KEY)).toMatch(/^[0-9a-f]{64}$/);

    clearDemoAccount();
    const testnet = createDemoAccount("Testnet demo", "testnet");
    expect(testnet).toMatchObject({ label: "Testnet demo", demo: true });
    expect(values.get(DEMO_KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the shared Hardhat demo account only on a local chain", () => {
    const values = installStorage();
    createDemoAccount("Local demo", "local", LOCAL_CHAIN_KEY);
    expect(values.get(DEMO_KEY)).toBe(LOCAL_CHAIN_KEY);

    clearDemoAccount();
    createDemoAccount("Testnet demo", "testnet", LOCAL_CHAIN_KEY);
    expect(values.get(DEMO_KEY)).not.toBe(LOCAL_CHAIN_KEY);
  });

  it("clears an existing demo key and blocks its mainnet signing path", async () => {
    const values = installStorage({
      [ACCOUNT_KEY]: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        credentialId: "demo:1111111111111111",
        label: "Demo",
        demo: true,
      }),
      [DEMO_KEY]: "1".repeat(64),
    });

    await expect(
      withSession({} as never, "http://127.0.0.1:8545", "mainnet", async () => "signed"),
    ).rejects.toThrow(/only available/i);
    expect(values.get(ACCOUNT_KEY)).toBeUndefined();
    expect(values.get(DEMO_KEY)).toBeUndefined();
  });

  it("removes stale demo key material without signing out a passkey account", () => {
    const passkey = JSON.stringify({
      address: "0x2222222222222222222222222222222222222222",
      credentialId: "credential",
      label: "Real account",
    });
    const values = installStorage({ [ACCOUNT_KEY]: passkey, [DEMO_KEY]: "2".repeat(64) });

    expect(clearDemoAccount()).toBe(false);
    expect(values.get(ACCOUNT_KEY)).toBe(passkey);
    expect(values.get(DEMO_KEY)).toBeUndefined();
  });
});
