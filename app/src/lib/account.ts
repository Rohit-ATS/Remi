// The entire account layer. Mera only.
//
// No seed phrase, no browser extension, no custody backend, no second auth
// provider. A passkey is the account, and the Face ID prompt the user sees is
// literally the transaction confirmation — there is no separate "approve" step
// to explain, because the signing key only exists for the length of one call.
//
// Two keys come out of the same passkey, under different PRF salts:
//
//   default salt          -> the secp256k1 key that signs payouts
//   remi.payeebook.v1     -> an AES-GCM key that encrypts the payee book
//
// The second never signs anything and never yields an address. It is what makes
// selective disclosure possible: the chain carries amounts and counterparties,
// while the names that join them to people stay encrypted under a key only the
// holder of the passkey can derive. See vault.ts.

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { createWalletClient, http, type Address, type Chain, type WalletClient } from "viem";
import type { ServerConfig } from "./api.ts";

export type StoredAccount = {
  address: Address;
  credentialId: string;
  transports?: readonly string[];
  label: string;
  /** A demo account: its key sits in localStorage, so nothing ever prompts. */
  demo?: true;
};

const STORAGE_KEY = "remi.account.v1";
const DEMO_KEY_STORAGE = "remi.demo-key.v1";
const RP_NAME = "Remi";

/** Salt for the payee-book encryption key. Never used for signing. */
export const PAYEE_BOOK_SALT_INPUT = "remi.payeebook.v1";

function rpId(): string {
  return location.hostname;
}

/** localStorage throws in a private window, and a thrown read must not sign the user out of nothing. */
function readStored(): StoredAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as StoredAccount;
    if (typeof parsed?.address !== "string" || typeof parsed?.credentialId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(account: StoredAccount): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  } catch {
    // A session that cannot be remembered still works; the user signs in again.
  }
}

export function getStoredAccount(): StoredAccount | null {
  return readStored();
}

export function signOut(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEMO_KEY_STORAGE);
  } catch {
    // Nothing to do: there is no key material to clear, only a pointer.
  }
}

/** Demo keys are deliberately limited to networks where their token has no real value. */
export function demoAccountsAllowed(network: ServerConfig["network"] | null | undefined): boolean {
  return network === "local" || network === "testnet";
}

/** Removes a demo key on a real-money network without disturbing a passkey account. */
export function clearDemoAccount(): boolean {
  const demoAccount = readStored()?.demo === true;
  try {
    localStorage.removeItem(DEMO_KEY_STORAGE);
    if (demoAccount) localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable; there is no usable demo key in that case.
  }
  return demoAccount;
}

// ---- the demo account
//
// A passkey needs hardware Remi cannot assume: a device with a platform
// authenticator whose password manager implements the WebAuthn PRF extension.
// Where that is missing — a desktop browser without Touch ID, a VM, a
// screenshare, a demo on someone else's laptop — the product is unreachable,
// which is a poor way to show what it does.
//
// So there is a second, clearly-labelled door. It replaces the PRF output with
// 32 random bytes kept in localStorage, and everything downstream is unchanged:
// the same derivation, the same address, the same signing path, the same
// encrypted payee book. The only thing it gives up is the thing that matters
// most in production — the key is at rest in the browser instead of behind a
// face — which is why it is named a demo everywhere it appears.

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(text.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** The demo account's stand-in for a PRF output, or null when there is none. */
function readDemoKey(): Uint8Array<ArrayBuffer> | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY_STORAGE);
    if (raw === null || !/^[0-9a-f]{64}$/.test(raw)) return null;
    return fromHex(raw);
  } catch {
    return null;
  }
}

/**
 * The demo account's key material for a given PRF salt.
 *
 * A passkey answers each salt with a different 32 bytes, and the payee book
 * depends on that: its encryption key must not be the signing key. Hashing the
 * stored key together with the salt reproduces that separation.
 */
export async function demoPrfOutput(salt?: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  const key = readDemoKey();
  if (key === null) return null;
  if (salt === undefined) return key;

  const input = new Uint8Array(new ArrayBuffer(key.length + salt.length));
  input.set(key, 0);
  input.set(salt, key.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

/** Signs in without a passkey on a local or test network. */
export function createDemoAccount(
  label: string,
  network: ServerConfig["network"] | null | undefined,
): StoredAccount {
  if (!demoAccountsAllowed(network)) {
    clearDemoAccount();
    throw new Error("Demo accounts are only available on local and testnet deployments.");
  }
  let key = readDemoKey();
  if (key === null) {
    key = new Uint8Array(new ArrayBuffer(32));
    crypto.getRandomValues(key);
    try {
      localStorage.setItem(DEMO_KEY_STORAGE, toHex(key));
    } catch {
      throw new Error("A demo account needs browser storage, which this window has turned off.");
    }
  }

  const account: StoredAccount = {
    address: addressFromPrf(key),
    // There is no credential, but the field is the account's identity
    // everywhere else, so it carries a value that cannot collide with one.
    credentialId: `demo:${toHex(key).slice(0, 16)}`,
    label,
    demo: true,
  };
  writeStored(account);
  return account;
}

/** Turns a 32-byte PRF output into the address it will sign as, without keeping the key. */
function addressFromPrf(prfOutput: Uint8Array): Address {
  const session = createSecp256k1SigningSession({ privateKey: prfOutput });
  try {
    return toViemAccount(session).address;
  } finally {
    session.end();
  }
}

/**
 * Creates a passkey and returns the account it derives.
 *
 * The PRF output is used directly as the secp256k1 private key. It is already
 * 32 bytes of deterministic, credential-bound entropy, so a BIP-44 tree over it
 * would add a dependency and a mnemonic round-trip without changing what the
 * key is or how it is recovered.
 */
export async function createAccount(label: string): Promise<StoredAccount> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: RP_NAME },
    user: { name: label, displayName: label },
  });

  const account: StoredAccount = {
    address: addressFromPrf(created.prfOutput),
    credentialId: created.credentialId,
    ...(created.transports !== undefined ? { transports: [...created.transports] } : {}),
    label,
  };
  writeStored(account);
  return account;
}

/**
 * Signs in with an existing passkey.
 *
 * Passing no credential lets the platform offer every Remi passkey on the
 * device, which is what makes "sign in on a new phone" work with nothing but a
 * face: the credential is discoverable, so there is no account id to remember.
 */
export async function signIn(label = "Remi"): Promise<StoredAccount> {
  const stored = readStored();
  const { credentialId, prfOutput } = await getPasskeyPrfOutput({
    rpId: rpId(),
    ...(stored !== null
      ? {
          credential: {
            credentialId: stored.credentialId,
            ...(stored.transports !== undefined ? { transports: stored.transports } : {}),
          },
        }
      : {}),
  });

  const account: StoredAccount = {
    address: addressFromPrf(prfOutput),
    credentialId,
    ...(stored?.transports !== undefined ? { transports: stored.transports } : {}),
    label: stored?.label ?? label,
  };
  writeStored(account);
  return account;
}

export type SessionContext = {
  client: WalletClient;
  address: Address;
};

/**
 * Runs one passkey ceremony, hands `fn` a wallet client, and ends the session.
 *
 * Each signing session is single-use: `end()` zeroes the key, and it is called
 * in a finally block so a thrown callback cannot leave live key material
 * behind. Nothing outside this function ever holds the private key or the PRF
 * output.
 */
export async function withSession<T>(
  chain: Chain,
  rpcUrl: string,
  network: ServerConfig["network"],
  fn: (context: SessionContext) => Promise<T>,
): Promise<T> {
  const stored = readStored();
  if (stored === null) throw new Error("Not signed in.");

  if (stored.demo === true) {
    if (!demoAccountsAllowed(network)) {
      clearDemoAccount();
      throw new Error("Demo accounts are only available on local and testnet deployments.");
    }
    const demo = await demoPrfOutput();
    if (demo !== null) return runSession(demo, chain, rpcUrl, fn);
  }

  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: {
      credentialId: stored.credentialId,
      ...(stored.transports !== undefined ? { transports: stored.transports } : {}),
    },
  });

  return runSession(prfOutput, chain, rpcUrl, fn);
}

/** The half of `withSession` that is the same however the key was obtained. */
async function runSession<T>(
  privateKey: Uint8Array,
  chain: Chain,
  rpcUrl: string,
  fn: (context: SessionContext) => Promise<T>,
): Promise<T> {
  const session = createSecp256k1SigningSession({ privateKey });
  try {
    const account = toViemAccount(session);
    const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
    return await fn({ client, address: account.address });
  } finally {
    session.end();
    privateKey.fill(0);
  }
}

/** Mera's error codes as sentences a non-technical person can act on. */
export function describeError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This device's password manager can't create a Remi account. Try iCloud Keychain, 1Password, or Google Password Manager.";
      case "PASSKEY_OPERATION_FAILED":
        return "Face ID was cancelled. Tap to try again.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser is missing the security features Remi needs. Try Safari or Chrome.";
      case "DECRYPT_FAILED":
        return "That payee book could not be opened with this passkey.";
      case "SESSION_ENDED":
        // Internal by construction: a session is created and ended inside one call.
        return "Something went wrong confirming that. Try again.";
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    const message = error.message;
    if (/insufficient funds/i.test(message)) {
      return "This account doesn't have enough MON to cover the network fee.";
    }
    if (/user rejected|denied/i.test(message)) return "Cancelled.";
    // viem's revert messages are long; the first line is the useful part.
    return message.split("\n")[0] ?? "Something went wrong.";
  }
  return "Something went wrong.";
}
