import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { formatDate, formatMonth, formatUsd, shortAddress } from "../lib/money.ts";
/**
 * The Passport: a worker's own income record.
 *
 * This is the half of a payout that no payroll product ships. The business got
 * a receipt and a bookkeeping entry; the worker gets a verifiable earnings
 * history that spans every client who has ever paid them, which is the thing a
 * landlord, a lender or a visa officer actually asks for and the thing a bank
 * statement in the wrong currency cannot provide.
 *
 * Every figure comes from `assess()` on the server, computed from settled
 * payouts. Nothing here is a model's opinion.
 */
export function PassportScreen({ address, config, account, shared = false, }) {
    const [assessment, setAssessment] = useState(null);
    const [payouts, setPayouts] = useState([]);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        let cancelled = false;
        api
            .passport(address)
            .then((result) => {
            if (cancelled)
                return;
            setAssessment(result.assessment);
            setPayouts(result.payouts);
        })
            .catch((caught) => {
            if (!cancelled) {
                setError(caught instanceof Error ? caught.message : "That record could not be loaded.");
            }
        });
        return () => {
            cancelled = true;
        };
    }, [address]);
    const share = async () => {
        try {
            await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/p/${address}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            setCopied(false);
        }
    };
    const isOwn = account !== null && account.address.toLowerCase() === address.toLowerCase();
    const peak = assessment === null
        ? 0n
        : assessment.byMonth.reduce((max, row) => {
            const value = BigInt(row.total);
            return value > max ? value : max;
        }, 0n);
    return (_jsxs("main", { className: "shell wide", children: [_jsxs("header", { className: "topbar", children: [_jsx("span", { className: "mark", children: _jsx("a", { href: "#/", children: "Remi" }) }), config?.network === "testnet" && _jsx("span", { className: "chip", children: "Testnet" })] }), error !== null && _jsx("div", { className: "notice notice-error", children: error }), assessment === null && error === null && (_jsxs("p", { className: "hushed", children: [_jsx("span", { className: "spinner" }), " Reading the record\u2026"] })), assessment !== null && (_jsxs("div", { className: "stack", children: [_jsxs("div", { children: [_jsx("h1", { children: isOwn ? "Your income record" : "Income record" }), _jsx("p", { className: "hushed small mono", style: { marginTop: "0.4rem" }, children: shortAddress(address) })] }), assessment.payoutCount === 0 ? (_jsxs("div", { className: "empty", children: [_jsx("p", { children: "No payouts have been received at this address yet." }), _jsx("p", { className: "small faint", children: "A record starts with the first payout and grows with every client who pays into it." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "panel stack", children: [_jsxs("div", { className: "spread", children: [_jsx("span", { className: "eyebrow", children: "Verified earnings" }), _jsxs("span", { className: "chip chip-solar", children: [assessment.payoutCount, " ", assessment.payoutCount === 1 ? "record" : "records"] })] }), _jsx("p", { className: "receipt-amount", children: formatUsd(assessment.totalEarned) }), _jsxs("dl", { style: { margin: 0 }, children: [_jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Clients" }), _jsx("dd", { children: assessment.clientCount })] }), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Months active" }), _jsxs("dd", { children: [assessment.monthsActive, " of ", assessment.monthsObserved] })] }), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Median month" }), _jsx("dd", { children: formatUsd(assessment.medianMonthly) })] }), assessment.firstPaidAt !== null && (_jsxs("div", { className: "kv", children: [_jsx("dt", { children: "First paid" }), _jsx("dd", { children: formatDate(assessment.firstPaidAt) })] }))] }), assessment.byMonth.length > 0 && (_jsx("div", { className: "bars", children: assessment.byMonth.slice(-6).map((row) => (_jsxs("div", { className: "bar", children: [_jsx("span", { className: "t", children: row.month }), _jsx("span", { className: "track", children: _jsx("span", { className: "fill", style: {
                                                            width: peak === 0n
                                                                ? "0%"
                                                                : `${Number((BigInt(row.total) * 100n) / peak)}%`,
                                                        } }) }), _jsx("span", { className: "a", children: formatUsd(row.total) })] }, row.month))) }))] }), _jsxs("section", { className: "card stack-sm", children: [_jsx("span", { className: "eyebrow", children: "Income stability" }), _jsxs("div", { className: "score", children: [_jsx("b", { children: assessment.stabilityScore }), _jsx("span", { className: "hushed small", children: "/ 100" })] }), _jsx("p", { className: "small hushed", children: "Steadiness of this income, not its size. Computed from settled payouts \u2014 regularity, how many clients, how much of the period was covered, and how long the record runs." }), _jsx("ul", { className: "small hushed", style: { margin: 0, paddingLeft: "1.1rem" }, children: assessment.reasons.map((reason) => (_jsx("li", { children: reason }, reason))) }), assessment.signals.confidence >= 1 && (_jsxs("div", { className: "notice notice-solar", style: { marginTop: "0.4rem" }, children: ["An advance of up to", " ", _jsx("strong", { children: formatUsd(assessment.advanceCeiling) }), " would be supportable against this record. Remi does not lend \u2014 this is what the record is worth to someone who does."] }))] }), assessment.byClient.length > 0 && (_jsxs("section", { className: "stack-sm", children: [_jsx("h2", { children: "Where it came from" }), _jsx("div", { className: "list", children: assessment.byClient.map((client) => (_jsxs("div", { className: "spread", children: [_jsxs("span", { children: [_jsx("strong", { className: "mono", children: shortAddress(client.payer) }), _jsx("br", {}), _jsxs("span", { className: "small hushed", children: [client.count, " ", client.count === 1 ? "payout" : "payouts", " \u00B7", " ", Math.round(client.share * 100), "% of earnings"] })] }), _jsx("span", { className: "figure", children: formatUsd(client.total) })] }, client.payer))) }), _jsx("p", { className: "small faint", children: "Clients appear as addresses. Their names are encrypted under a key only the account holder can derive, so a record can be shown without exposing who it was shown about." })] })), _jsxs("section", { className: "stack-sm", children: [_jsx("h2", { children: "Payouts" }), _jsx("div", { className: "scroll", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "From" }), _jsx("th", { children: "For" }), _jsx("th", { children: "Amount" })] }) }), _jsx("tbody", { children: payouts.map((payout) => (_jsxs("tr", { children: [_jsx("td", { children: formatDate(payout.timestamp) }), _jsx("td", { className: "mono", children: shortAddress(payout.payer) }), _jsx("td", { children: payout.memo || payout.category }), _jsx("td", { className: "n", children: formatUsd(payout.amount) })] }, payout.receipt_no))) })] }) })] }), !shared && (_jsxs("div", { className: "stack-sm", children: [_jsx("button", { type: "button", className: "btn btn-primary", onClick: () => void share(), children: copied ? "Link copied" : "Share this record" }), _jsx("p", { className: "small faint", children: "Anyone with the link can check the amounts and dates against the chain. They cannot see your clients\u2019 names, and nothing on the link reveals who you work for." })] })), shared && (_jsxs("p", { className: "small faint", children: ["Every figure on this page traces to a settled payout that anyone can verify independently. ", formatMonth(assessment.byMonth[0]?.month ?? ""), " onward."] }))] }))] }))] }));
}
