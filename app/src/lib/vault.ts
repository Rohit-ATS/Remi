// The second key.
//
// The same passkey, evaluated under a different PRF salt, yields 32 bytes that
// are cryptographically unrelated to the signing key. Those bytes are imported
// as an AES-GCM key and never touch a transaction.
//
// This is what makes an on-chain income record safe to publish. RemiPayouts
// stores amounts, timestamps and counterparty addresses — never names. The
// mapping from an address to "Maria Santos, Philippines" lives here, encrypted
// client-side, so:
//
//   - nobody server-side can read a contractor's name or country
//   - a worker's income history is meaningless to an observer until the worker
//     hands over a key, which is what selective disclosure means in practice
//   - signing in on a new phone with the same Face ID recovers both keys, so
//     there is no backup file and no seed phrase
//
// The key is derived per operation and never stored.

import { getPasskeyPrfOutput } from "@category-labs/mera";
import { demoPrfOutput, PAYEE_BOOK_SALT_INPUT, type StoredAccount } from "./account.ts";

export type PayeeEntry = {
  label: string;
  address: string;
  name: string;
  country: string;
  note?: string;
};

type VaultBlob = {
  version: 1;
  nonce: string;
  ciphertext: string;
};

const STORAGE_KEY = "remi.payeebook.v1";
const REMINDERS_KEY = "remi.reminders.v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Typed over a concrete ArrayBuffer: WebCrypto's BufferSource rejects the
// ArrayBufferLike that `new Uint8Array(n)` infers to under strict settings.
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The salt is a hash of a fixed string, so it is 32 bytes and stable forever. */
async function payeeBookSalt(): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(PAYEE_BOOK_SALT_INPUT),
  );
  return new Uint8Array(digest);
}

/**
 * Derives the payee-book key. One Face ID prompt.
 *
 * `extractable: false` means the raw bytes cannot be read back out of the
 * CryptoKey, so nothing in the app can accidentally log or transmit them.
 */
async function deriveKey(account: StoredAccount): Promise<CryptoKey> {
  // A demo account has no passkey to ask, but it still has a distinct secret
  // per salt, so the payee book is encrypted exactly as it otherwise would be.
  if (account.demo === true) {
    const secret = await demoPrfOutput(await payeeBookSalt());
    if (secret === null) throw new Error("This demo account's key is missing.");
    return importAesKey(secret);
  }

  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: {
      credentialId: account.credentialId,
      ...(account.transports !== undefined ? { transports: account.transports } : {}),
    },
    prfSalt: await payeeBookSalt(),
  });

  return importAesKey(prfOutput);
}

async function importAesKey(secret: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey("raw", secret, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    secret.fill(0);
  }
}

function readBlob(storageKey: string = STORAGE_KEY): VaultBlob | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as VaultBlob;
    if (parsed?.version !== 1 || typeof parsed.nonce !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** True when there is something encrypted to open. */
export function hasPayeeBook(): boolean {
  return readBlob() !== null;
}

async function unlockAt<T>(account: StoredAccount, storageKey: string, fallback: T): Promise<T> {
  const blob = readBlob(storageKey);
  if (blob === null) return fallback;

  const key = await deriveKey(account);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.nonce) },
    key,
    fromBase64(blob.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function saveAt(
  account: StoredAccount,
  storageKey: string,
  value: unknown,
  whatFailed: string,
): Promise<void> {
  const key = await deriveKey(account);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );

  const blob: VaultBlob = {
    version: 1,
    nonce: toBase64(nonce),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(blob));
  } catch {
    throw new Error(`This browser would not store ${whatFailed}. Check its storage settings.`);
  }
}

export async function unlockPayeeBook(account: StoredAccount): Promise<PayeeEntry[]> {
  return unlockAt<PayeeEntry[]>(account, STORAGE_KEY, []);
}

export async function savePayeeBook(account: StoredAccount, entries: PayeeEntry[]): Promise<void> {
  await saveAt(account, STORAGE_KEY, entries, "the payee book");
}

/**
 * Payment reminders, under the same key as the payee book.
 *
 * A reminder says who is owed what and when, so it carries exactly the thing
 * this file exists to keep off a server: a name attached to a sum of money.
 * Storing reminders in the clear beside an encrypted payee book would hand an
 * observer the mapping anyway, so they go behind the same Face ID.
 */
export async function unlockReminders<T>(account: StoredAccount): Promise<T[]> {
  return unlockAt<T[]>(account, REMINDERS_KEY, []);
}

export async function saveReminders(account: StoredAccount, reminders: unknown[]): Promise<void> {
  await saveAt(account, REMINDERS_KEY, reminders, "your reminders");
}

/** True when there is an encrypted reminder list to open. */
export function hasReminders(): boolean {
  return readBlob(REMINDERS_KEY) !== null;
}

/**
 * Adds or replaces one entry, re-encrypting the whole book.
 *
 * Takes the already-decrypted book so a save costs one Face ID prompt rather
 * than two.
 */
export function upsertEntry(book: PayeeEntry[], entry: PayeeEntry): PayeeEntry[] {
  const index = book.findIndex((e) => e.label.toLowerCase() === entry.label.toLowerCase());
  if (index === -1) return [...book, entry];
  return book.map((e, i) => (i === index ? entry : e));
}

export function findEntry(book: PayeeEntry[], label: string): PayeeEntry | undefined {
  return book.find((e) => e.label.toLowerCase() === label.toLowerCase());
}
