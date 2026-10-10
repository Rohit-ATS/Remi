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
import { createPasskeyWithPrfOutput, createSecp256k1SigningSession, getPasskeyPrfOutput, isMeraError, } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { createWalletClient, http } from "viem";
const STORAGE_KEY = "remi.account.v1";
const RP_NAME = "Remi";
/** Salt for the payee-book encryption key. Never used for signing. */
export const PAYEE_BOOK_SALT_INPUT = "remi.payeebook.v1";
function rpId() {
    return location.hostname;
}
/** localStorage throws in a private window, and a thrown read must not sign the user out of nothing. */
function readStored() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null)
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.address !== "string" || typeof parsed?.credentialId !== "string")
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function writeStored(account) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    }
    catch {
        // A session that cannot be remembered still works; the user signs in again.
    }
}
export function getStoredAccount() {
    return readStored();
}
export function signOut() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    }
    catch {
        // Nothing to do: there is no key material to clear, only a pointer.
    }
}
/** Turns a 32-byte PRF output into the address it will sign as, without keeping the key. */
function addressFromPrf(prfOutput) {
    const session = createSecp256k1SigningSession({ privateKey: prfOutput });
    try {
        return toViemAccount(session).address;
    }
    finally {
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
export async function createAccount(label) {
    const created = await createPasskeyWithPrfOutput({
        rp: { id: rpId(), name: RP_NAME },
        user: { name: label, displayName: label },
    });
    const account = {
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
export async function signIn(label = "Remi") {
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
    const account = {
        address: addressFromPrf(prfOutput),
        credentialId,
        ...(stored?.transports !== undefined ? { transports: stored.transports } : {}),
        label: stored?.label ?? label,
    };
    writeStored(account);
    return account;
}
/**
 * Runs one passkey ceremony, hands `fn` a wallet client, and ends the session.
 *
 * Each signing session is single-use: `end()` zeroes the key, and it is called
 * in a finally block so a thrown callback cannot leave live key material
 * behind. Nothing outside this function ever holds the private key or the PRF
 * output.
 */
export async function withSession(chain, rpcUrl, fn) {
    const stored = readStored();
    if (stored === null)
        throw new Error("Not signed in.");
    const { prfOutput } = await getPasskeyPrfOutput({
        rpId: rpId(),
        credential: {
            credentialId: stored.credentialId,
            ...(stored.transports !== undefined ? { transports: stored.transports } : {}),
        },
    });
    const session = createSecp256k1SigningSession({ privateKey: prfOutput });
    try {
        const account = toViemAccount(session);
        const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
        return await fn({ client, address: account.address });
    }
    finally {
        session.end();
        prfOutput.fill(0);
    }
}
/** Mera's error codes as sentences a non-technical person can act on. */
export function describeError(error) {
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
        if (/user rejected|denied/i.test(message))
            return "Cancelled.";
        // viem's revert messages are long; the first line is the useful part.
        return message.split("\n")[0] ?? "Something went wrong.";
    }
    return "Something went wrong.";
}
