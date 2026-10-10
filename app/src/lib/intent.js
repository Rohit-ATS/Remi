// The payout parser.
//
// This is the only thing in the product that can start a payment, and it is
// deliberately deterministic: no network call and no model sits between the
// words a person says and the money leaving their account. Anything this
// parser rejects is routed to the assistant as a question instead, which can
// only read.
//
// It accepts both word orders people actually use ("pay Maria $400" and
// "send $400 to Maria"), digits and words for the amount, and an optional memo
// introduced by "for".
import { parseAmount } from "./money.ts";
const UNITS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19,
};
const TENS = {
    twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90,
};
const SCALES = { hundred: 100, thousand: 1000 };
const CURRENCY_WORDS = new Set(["dollar", "dollars", "usd", "ausd", "bucks", "buck"]);
const FILLER = new Set(["and", "a", "the", "please", "to", "of"]);
/** Turns "four hundred fifty" into 450. Returns null if no number words apply. */
function wordsToNumber(words) {
    let total = 0;
    let current = 0;
    let matched = false;
    for (const word of words) {
        if (word in UNITS) {
            current += UNITS[word];
            matched = true;
        }
        else if (word in TENS) {
            current += TENS[word];
            matched = true;
        }
        else if (word in SCALES) {
            const scale = SCALES[word];
            if (scale === 100) {
                current = (current === 0 ? 1 : current) * 100;
            }
            else {
                total += (current === 0 ? 1 : current) * scale;
                current = 0;
            }
            matched = true;
        }
        else if (FILLER.has(word)) {
            continue;
        }
        else {
            return null;
        }
    }
    return matched ? total + current : null;
}
function cleanName(raw) {
    const name = raw
        .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
    // Keep at most two words: "Maria" and "Maria Santos" are both plausible, a
    // whole trailing clause is not.
    return name.split(" ").slice(0, 2).join(" ");
}
function titleCase(name) {
    return name
        .split(" ")
        .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
        .join(" ");
}
/**
 * Reads a payout out of a sentence.
 *
 * Returns a reason rather than throwing, because the composer shows that reason
 * behind a "Did you mean to pay someone?" line and never discards what was typed.
 */
export function parsePaymentIntent(transcript) {
    const text = transcript.trim();
    if (text === "")
        return { ok: false, reason: "Nothing to read yet." };
    const lower = text.toLowerCase();
    // A question is never a payout, even when it contains a payment verb and a
    // number. "How much did I pay contractors in 2026" would otherwise read as a
    // $2,026 payout to "Contractors In", and the confirm sheet is the last place
    // to discover that. Questions go to the assistant, which can only read.
    if (text.endsWith("?") || /^(how|what|who|whom|which|when|where|why|did|do|does|can|could|should|is|are|was|were|am|will|would|show|list|tell)\b/.test(lower)) {
        return { ok: false, reason: "This reads as a question, not a payout." };
    }
    if (!/\b(pay|send|transfer|wire)\b/.test(lower)) {
        return { ok: false, reason: "No payment verb, so this reads as a question." };
    }
    // Split a trailing memo off first, so "for October" never becomes a name.
    let body = text;
    let memo = "";
    const forMatch = /\s+for\s+(.+)$/i.exec(body);
    if (forMatch) {
        memo = forMatch[1].trim();
        body = body.slice(0, forMatch.index);
    }
    // Shape A: "send $400 to Maria" / "send four hundred dollars to Maria"
    const toMatch = /\b(?:pay|send|transfer|wire)\b\s+(.+?)\s+\bto\s+(.+)$/i.exec(body);
    // Shape B: "pay Maria $400" / "pay Maria four hundred dollars"
    const directMatch = /\b(?:pay|send|transfer|wire)\b\s+(.+)$/i.exec(body);
    let nameRaw = null;
    let amountRaw = null;
    if (toMatch) {
        amountRaw = toMatch[1];
        nameRaw = toMatch[2];
    }
    else if (directMatch) {
        const rest = directMatch[1].trim();
        // The amount is whichever end carries the digits or number words.
        const digits = /(\$?\s*[\d,]+(?:\.\d{1,6})?)/.exec(rest);
        if (digits) {
            amountRaw = digits[1];
            nameRaw = (rest.slice(0, digits.index) + " " + rest.slice(digits.index + digits[1].length)).trim();
        }
        else {
            // No digits: scan from the right for the longest run of number words.
            const words = rest.split(/\s+/);
            for (let i = words.length; i > 0; i--) {
                const tail = words.slice(i - 1).map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
                const stripped = tail.filter((w) => !CURRENCY_WORDS.has(w) && w !== "");
                if (stripped.length === 0)
                    continue;
                if (wordsToNumber(stripped) !== null) {
                    amountRaw = words.slice(i - 1).join(" ");
                    nameRaw = words.slice(0, i - 1).join(" ");
                }
            }
            if (amountRaw === null)
                return { ok: false, reason: "No amount found." };
        }
    }
    else {
        return { ok: false, reason: "Could not find who to pay." };
    }
    if (!nameRaw || cleanName(nameRaw) === "") {
        return { ok: false, reason: "Could not find who to pay." };
    }
    // Resolve the amount: digits first, then number words.
    let amount = null;
    const numeric = /\$?\s*([\d,]+(?:\.\d{1,6})?)/.exec(amountRaw);
    if (numeric) {
        amount = parseAmount(numeric[1].replace(/,/g, ""));
    }
    else {
        const words = amountRaw
            .toLowerCase()
            .split(/\s+/)
            .map((w) => w.replace(/[^a-z]/g, ""))
            .filter((w) => w !== "" && !CURRENCY_WORDS.has(w));
        const value = wordsToNumber(words);
        if (value !== null)
            amount = parseAmount(String(value));
    }
    if (amount === null)
        return { ok: false, reason: "Could not read the amount." };
    if (amount <= 0n)
        return { ok: false, reason: "The amount has to be more than zero." };
    const payee = titleCase(cleanName(nameRaw));
    if (payee === "")
        return { ok: false, reason: "Could not find who to pay." };
    // A bare amount word captured as a name means the sentence was ambiguous.
    if (wordsToNumber(payee.toLowerCase().split(/\s+/)) !== null) {
        return { ok: false, reason: "Could not tell the name from the amount." };
    }
    return { ok: true, intent: { payee, amount, memo } };
}
