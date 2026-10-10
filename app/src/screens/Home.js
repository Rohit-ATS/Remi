import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { describeError } from "../lib/account.ts";
import { parsePaymentIntent } from "../lib/intent.ts";
import { formatAmount, formatDate, formatUsd } from "../lib/money.ts";
import { enablePayouts, preflight, savePayee, sendPayout, getBalance } from "../lib/payouts.ts";
import { useSpeech } from "../lib/speech.ts";
import { findEntry, savePayeeBook, unlockPayeeBook, upsertEntry, hasPayeeBook, } from "../lib/vault.ts";
import { ConfirmSheet, PayeeSheet } from "./Sheets.tsx";
import { navigate } from "../lib/router.ts";
export function Home({ config, account, onSignOut, }) {
    const [text, setText] = useState("");
    const [balance, setBalance] = useState(null);
    const [payouts, setPayouts] = useState([]);
    const [book, setBook] = useState(null);
    const [parseReason, setParseReason] = useState(null);
    const [pending, setPending] = useState(null);
    const [unknownLabel, setUnknownLabel] = useState(null);
    const [needsApproval, setNeedsApproval] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sheetError, setSheetError] = useState(null);
    const [asking, setAsking] = useState(false);
    const [answer, setAnswer] = useState(null);
    const [notice, setNotice] = useState(null);
    const inputRef = useRef(null);
    const refresh = useCallback(async () => {
        const [balanceResult, payoutsResult] = await Promise.allSettled([
            getBalance(config, account.address),
            api.payouts(account.address),
        ]);
        if (balanceResult.status === "fulfilled")
            setBalance(balanceResult.value);
        if (payoutsResult.status === "fulfilled")
            setPayouts(payoutsResult.value.payouts);
    }, [config, account.address]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const speech = useSpeech((transcript) => {
        setText(transcript);
        void route(transcript);
    });
    /** The composer's one decision: a payout, or a question. */
    const route = useCallback(async (input) => {
        const parsed = parsePaymentIntent(input);
        setAnswer(null);
        if (!parsed.ok) {
            setParseReason(parsed.reason);
            setAsking(true);
            try {
                setAnswer(await api.ask(account.address, input));
            }
            catch (caught) {
                setAnswer({
                    answer: caught instanceof Error
                        ? `That question could not be answered right now (${caught.message}).`
                        : "That question could not be answered right now.",
                    rows: [],
                    source: "fallback",
                    note: null,
                });
            }
            finally {
                setAsking(false);
            }
            return;
        }
        setParseReason(null);
        // Unlocking the book costs a Face ID prompt, so it is only opened when a
        // payout actually needs a name resolved.
        let currentBook = book;
        if (currentBook === null) {
            if (!hasPayeeBook()) {
                currentBook = [];
                setBook([]);
            }
            else {
                try {
                    currentBook = await unlockPayeeBook(account);
                    setBook(currentBook);
                }
                catch (caught) {
                    setNotice(describeError(caught));
                    return;
                }
            }
        }
        const entry = findEntry(currentBook, parsed.intent.payee);
        if (entry === undefined) {
            setPending({
                label: parsed.intent.payee,
                amount: parsed.intent.amount,
                memo: parsed.intent.memo,
                category: "Contractor",
                entry: null,
            });
            setUnknownLabel(parsed.intent.payee);
            return;
        }
        openConfirm({
            label: parsed.intent.payee,
            amount: parsed.intent.amount,
            memo: parsed.intent.memo,
            category: "Contractor",
            entry,
        });
    }, [account, book]);
    const openConfirm = useCallback(async (next) => {
        setSheetError(null);
        setPending(next);
        if (next.entry === null)
            return;
        const check = await preflight(config, account.address, next.entry.address, next.amount);
        if (check.ok) {
            setNeedsApproval(false);
            return;
        }
        if (check.kind === "needs-approval") {
            setNeedsApproval(true);
            return;
        }
        if (check.kind === "insufficient-funds") {
            setSheetError(`You have ${formatUsd(check.available)} available and this payout is ${formatUsd(next.amount)}. Add funds to send it.`);
            return;
        }
        setSheetError("That recipient's details do not look right. Check the address and save again.");
    }, [config, account.address]);
    const onSavePayee = async (entry) => {
        setBusy(true);
        setSheetError(null);
        try {
            const next = upsertEntry(book ?? [], entry);
            await savePayeeBook(account, next);
            setBook(next);
            await savePayee(config, entry.label, entry.address, entry.country);
            setUnknownLabel(null);
            if (pending !== null)
                await openConfirm({ ...pending, entry });
        }
        catch (caught) {
            setSheetError(describeError(caught));
        }
        finally {
            setBusy(false);
        }
    };
    const onConfirm = async () => {
        if (pending === null || pending.entry === null)
            return;
        setBusy(true);
        setSheetError(null);
        try {
            if (needsApproval) {
                await enablePayouts(config);
                setNeedsApproval(false);
            }
            const sent = await sendPayout(config, {
                label: pending.label,
                payeeAddress: pending.entry.address,
                amount: pending.amount,
                memo: pending.memo,
                category: pending.category,
                labelIsSaved: true,
            });
            setPending(null);
            setText("");
            // The indexer polls, but a nudge makes the receipt appear immediately.
            await api.reindex().catch(() => undefined);
            await refresh();
            if (sent.receiptNo !== null) {
                navigate(`/r/${sent.receiptNo}`);
            }
            else {
                setNotice(`Sent in ${(sent.confirmedInMs / 1000).toFixed(1)}s.`);
            }
        }
        catch (caught) {
            setSheetError(describeError(caught));
        }
        finally {
            setBusy(false);
        }
    };
    const onSubmit = (event) => {
        event.preventDefault();
        if (text.trim() !== "")
            void route(text);
    };
    return (_jsxs("main", { className: "shell", children: [_jsxs("header", { className: "topbar", children: [_jsx("span", { className: "mark", children: _jsx("a", { href: "#/", children: "Remi" }) }), config.network === "testnet" && _jsx("span", { className: "chip", children: "Testnet" }), _jsx("button", { type: "button", className: "chip", onClick: onSignOut, children: "Sign out" })] }), _jsxs("div", { className: "stack", children: [_jsxs("div", { className: "balance", children: [_jsx("span", { className: "eyebrow", children: "Available" }), _jsx("span", { className: "amount", children: balance === null ? "—" : `$${formatAmount(balance)}` })] }), _jsxs("form", { className: "composer", onSubmit: onSubmit, children: [_jsxs("div", { className: "inputrow", children: [_jsx("input", { ref: inputRef, value: text, onChange: (event) => setText(event.target.value), placeholder: "Pay Maria four hundred dollars for October", "aria-label": "Pay someone, or ask about your books", autoComplete: "off" }), speech.supported && (_jsx("button", { type: "button", className: "mic", "data-listening": speech.listening, "aria-label": speech.listening ? "Stop listening" : "Speak", onClick: () => (speech.listening ? speech.stop() : speech.start()), children: speech.listening ? "■" : "●" }))] }), _jsx("button", { type: "submit", className: "btn btn-primary btn-block", disabled: text.trim() === "", children: asking ? _jsx("span", { className: "spinner" }) : "Go" }), _jsx("p", { className: "small faint", children: "Say who and how much to pay, or ask a question about your books." })] }), notice !== null && (_jsx("div", { className: "notice", onClick: () => setNotice(null), children: notice })), answer !== null && (_jsxs("div", { className: "card stack-sm", children: [_jsx("p", { className: "eyebrow", children: "Answer" }), _jsx("p", { children: answer.answer }), parseReason !== null && (_jsxs("p", { className: "small faint", children: ["Did you mean to pay someone? ", parseReason] })), answer.rows.length > 0 && (_jsx("div", { className: "scroll", style: { marginTop: "0.4rem" }, children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Payee" }), _jsx("th", { children: "Category" }), _jsx("th", { children: "Amount" })] }) }), _jsx("tbody", { children: answer.rows.map((row, index) => (_jsxs("tr", { children: [_jsx("td", { children: row.date }), _jsx("td", { children: row.label }), _jsx("td", { children: row.category }), _jsx("td", { className: "n", children: row.amount })] }, `${row.date}-${index}`))) })] }) })), _jsx("p", { className: "small faint", children: answer.source === "model"
                                    ? "Figures come from the rows above, not from the model."
                                    : (answer.note ?? "Computed from the rows above.") })] })), _jsxs("section", { className: "stack-sm", children: [_jsxs("div", { className: "spread", children: [_jsx("h2", { children: "Recent payouts" }), _jsx("a", { className: "small", href: "#/books", children: "Books" })] }), payouts.length === 0 ? (_jsxs("div", { className: "empty", children: [_jsx("p", { children: "No payouts yet." }), _jsx("p", { className: "small faint", children: "Your first one will appear here, and on the recipient\u2019s Passport." })] })) : (_jsx("div", { className: "list", children: payouts.slice(0, 8).map((payout) => (_jsxs("a", { href: `#/r/${payout.receipt_no}`, className: "spread", style: { textDecoration: "none", color: "inherit" }, children: [_jsxs("span", { children: [_jsx("strong", { children: payout.label || payout.payee.slice(0, 10) }), _jsx("br", {}), _jsxs("span", { className: "small hushed", children: [formatDate(payout.timestamp), " \u00B7 ", payout.category] })] }), _jsx("span", { className: "figure", children: formatUsd(payout.amount) })] }, payout.receipt_no))) }))] })] }), unknownLabel !== null && (_jsx(PayeeSheet, { label: unknownLabel, busy: busy, error: sheetError, onSave: (entry) => void onSavePayee(entry), onClose: () => {
                    setUnknownLabel(null);
                    setPending(null);
                    setSheetError(null);
                } })), unknownLabel === null && pending !== null && pending.entry !== null && (_jsx(ConfirmSheet, { pending: pending, categories: config.categories, networkFee: "about $0.01", busy: busy, error: sheetError, needsApproval: needsApproval, onCategory: (category) => setPending({ ...pending, category }), onConfirm: () => void onConfirm(), onClose: () => {
                    setPending(null);
                    setSheetError(null);
                } }))] }));
}
