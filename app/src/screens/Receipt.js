import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { formatDate, formatExact, formatUsd, shortAddress } from "../lib/money.ts";
/**
 * A settled payout.
 *
 * This screen is public. It is the link the payer shares, and the recipient
 * opens it with no account, no sign-in and no app install — which is the first
 * step of the loop that gets the recipient onto Remi at all.
 */
export function ReceiptScreen({ receiptNo, config, account, }) {
    const [receipt, setReceipt] = useState(null);
    const [verifyUrl, setVerifyUrl] = useState(null);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        let cancelled = false;
        api
            .receipt(receiptNo)
            .then((result) => {
            if (cancelled)
                return;
            setReceipt(result.receipt);
            setVerifyUrl(result.verifyUrl);
        })
            .catch((caught) => {
            if (cancelled)
                return;
            setError(caught instanceof Error && caught.message === "no such receipt"
                ? "That receipt does not exist yet. If the payout just settled, give it a moment."
                : "That receipt could not be loaded.");
        });
        return () => {
            cancelled = true;
        };
    }, [receiptNo]);
    const share = async () => {
        const url = `${location.origin}${location.pathname}#/r/${receiptNo}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            // Clipboard access is refused in some contexts; the link is in the address
            // bar either way, so this is not worth an error message.
            setCopied(false);
        }
    };
    const isRecipient = account !== null && receipt !== null && account.address.toLowerCase() === receipt.payee;
    return (_jsxs("main", { className: "shell", children: [_jsxs("header", { className: "topbar", children: [_jsx("span", { className: "mark", children: _jsx("a", { href: "#/", children: "Remi" }) }), config?.network === "testnet" && _jsx("span", { className: "chip", children: "Testnet" })] }), error !== null && _jsx("div", { className: "notice notice-error", children: error }), receipt === null && error === null && (_jsxs("p", { className: "hushed", children: [_jsx("span", { className: "spinner" }), " Loading receipt\u2026"] })), receipt !== null && (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "receipt", children: [_jsxs("div", { className: "spread", style: { alignItems: "flex-start" }, children: [_jsxs("span", { className: "eyebrow", children: ["Receipt ", String(receipt.receipt_no).padStart(4, "0")] }), _jsx("span", { className: "paid stamp-in", children: "PAID" })] }), _jsx("p", { className: "receipt-amount", style: { marginTop: "0.9rem" }, children: formatUsd(receipt.amount) }), _jsxs("p", { className: "hushed", style: { marginTop: "0.2rem" }, children: ["to ", receipt.label || shortAddress(receipt.payee)] }), _jsxs("dl", { style: { margin: "1.1rem 0 0" }, children: [_jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Settled" }), _jsx("dd", { children: formatDate(receipt.timestamp) })] }), receipt.memo !== "" && (_jsxs("div", { className: "kv", children: [_jsx("dt", { children: "For" }), _jsx("dd", { children: receipt.memo })] })), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Category" }), _jsx("dd", { children: receipt.category })] }), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Exact amount" }), _jsx("dd", { children: formatExact(receipt.amount) })] }), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "From" }), _jsx("dd", { children: shortAddress(receipt.payer) })] })] }), verifyUrl !== null && (_jsx("p", { className: "small", style: { marginTop: "1rem" }, children: _jsx("a", { href: verifyUrl, target: "_blank", rel: "noreferrer noopener", children: "Verify this payout" }) }))] }), _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", className: "btn btn-ghost", onClick: () => void share(), children: copied ? "Link copied" : "Share receipt" }), _jsx("a", { className: "btn btn-ghost", href: `#/p/${receipt.payee}`, children: isRecipient ? "My Passport" : "Recipient's Passport" })] }), account === null && (_jsxs("div", { className: "panel stack-sm", children: [_jsx("p", { className: "eyebrow", children: "For the person who was paid" }), _jsx("h2", { style: { color: "inherit" }, children: "This payout is already part of your record." }), _jsx("p", { className: "hushed", children: "Every payout you receive through Remi adds to an income history you own \u2014 across every client, not just this one. Set up with Face ID to claim it." }), _jsx("a", { className: "btn btn-solar", href: "#/", children: "Claim my Passport" })] }))] }))] }));
}
