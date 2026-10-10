// Money is integer minor units everywhere. AUSD has 6 decimals, so one dollar
// is 1_000_000n. Nothing in this file produces or accepts a float, because a
// payments app that rounds is a payments app that loses money.
export const DECIMALS = 6;
const BASE = 10n ** BigInt(DECIMALS);
/** Parses a decimal string like "400" or "400.50" into minor units. */
export function parseAmount(input) {
    const text = input.trim().replace(/[$,\s]/g, "");
    if (!/^\d*(\.\d*)?$/.test(text) || text === "" || text === ".")
        return null;
    const [wholePart = "0", fracPart = ""] = text.split(".");
    if (fracPart.length > DECIMALS)
        return null;
    const whole = BigInt(wholePart === "" ? "0" : wholePart);
    const frac = BigInt(fracPart.padEnd(DECIMALS, "0") || "0");
    return whole * BASE + frac;
}
/** "400.00" style, always two decimal places. */
export function formatAmount(minor) {
    const value = typeof minor === "string" ? BigInt(minor) : minor;
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const whole = abs / BASE;
    const cents = (abs % BASE) / 10000n;
    const body = `${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
    return negative ? `-${body}` : body;
}
export function formatUsd(minor) {
    return `$${formatAmount(minor)}`;
}
/** Full precision, for a receipt where the exact settled figure matters. */
export function formatExact(minor) {
    const value = typeof minor === "string" ? BigInt(minor) : minor;
    const whole = value / BASE;
    return `${whole.toLocaleString("en-US")}.${(value % BASE).toString().padStart(DECIMALS, "0")}`;
}
export function formatDate(unixSeconds) {
    return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
export function formatMonth(month) {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m)
        return month;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}
export function shortAddress(address) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
