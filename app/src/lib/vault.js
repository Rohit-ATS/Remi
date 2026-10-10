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
import { PAYEE_BOOK_SALT_INPUT } from "./account.ts";
const STORAGE_KEY = "remi.payeebook.v1";
function toBase64(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary);
}
// Typed over a concrete ArrayBuffer: WebCrypto's BufferSource rejects the
// ArrayBufferLike that `new Uint8Array(n)` infers to under strict settings.
function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
/** The salt is a hash of a fixed string, so it is 32 bytes and stable forever. */
async function payeeBookSalt() {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(PAYEE_BOOK_SALT_INPUT));
    return new Uint8Array(digest);
}
/**
 * Derives the payee-book key. One Face ID prompt.
 *
 * `extractable: false` means the raw bytes cannot be read back out of the
 * CryptoKey, so nothing in the app can accidentally log or transmit them.
 */
async function deriveKey(account) {
    const { prfOutput } = await getPasskeyPrfOutput({
        rpId: location.hostname,
        credential: {
            credentialId: account.credentialId,
            ...(account.transports !== undefined ? { transports: account.transports } : {}),
        },
        prfSalt: await payeeBookSalt(),
    });
    try {
        return await crypto.subtle.importKey("raw", prfOutput, { name: "AES-GCM" }, false, [
            "encrypt",
            "decrypt",
        ]);
    }
    finally {
        prfOutput.fill(0);
    }
}
function readBlob() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null)
            return null;
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || typeof parsed.nonce !== "string")
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/** True when there is something encrypted to open. */
export function hasPayeeBook() {
    return readBlob() !== null;
}
export async function unlockPayeeBook(account) {
    const blob = readBlob();
    if (blob === null)
        return [];
    const key = await deriveKey(account);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(blob.nonce) }, key, fromBase64(blob.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext));
}
export async function savePayeeBook(account, entries) {
    const key = await deriveKey(account);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(entries)));
    const blob = {
        version: 1,
        nonce: toBase64(nonce),
        ciphertext: toBase64(new Uint8Array(ciphertext)),
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    }
    catch {
        throw new Error("This browser would not store the payee book. Check its storage settings.");
    }
}
/**
 * Adds or replaces one entry, re-encrypting the whole book.
 *
 * Takes the already-decrypted book so a save costs one Face ID prompt rather
 * than two.
 */
export function upsertEntry(book, entry) {
    const index = book.findIndex((e) => e.label.toLowerCase() === entry.label.toLowerCase());
    if (index === -1)
        return [...book, entry];
    return book.map((e, i) => (i === index ? entry : e));
}
export function findEntry(book, label) {
    return book.find((e) => e.label.toLowerCase() === label.toLowerCase());
}
