import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { formatMonth, formatUsd } from "../lib/money.ts";
/**
 * Books.
 *
 * Every figure here is a view over payouts that already happened. There is no
 * bookkeeping to enter and no second source of truth, because the receipt the
 * payout wrote is the ledger entry.
 */
export function BooksScreen({ config, account, }) {
    const [books, setBooks] = useState(null);
    const [month, setMonth] = useState(undefined);
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        api
            .books(account.address, month)
            .then((result) => {
            if (!cancelled)
                setBooks(result);
        })
            .catch((caught) => {
            if (!cancelled) {
                setError(caught instanceof Error ? caught.message : "Books could not be loaded.");
            }
        });
        return () => {
            cancelled = true;
        };
    }, [account.address, month]);
    const largest = books === null
        ? 0n
        : books.byCategory.reduce((max, row) => {
            const value = BigInt(row.total);
            return value > max ? value : max;
        }, 0n);
    const delta = books === null
        ? null
        : BigInt(books.monthTotal) - BigInt(books.previousMonthTotal);
    return (_jsxs("main", { className: "shell wide", children: [_jsxs("header", { className: "topbar", children: [_jsx("span", { className: "mark", children: _jsx("a", { href: "#/", children: "Remi" }) }), config.network === "testnet" && _jsx("span", { className: "chip", children: "Testnet" })] }), error !== null && _jsx("div", { className: "notice notice-error", children: error }), books === null && error === null && (_jsxs("p", { className: "hushed", children: [_jsx("span", { className: "spinner" }), " Adding it up\u2026"] })), books !== null && (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "spread", children: [_jsx("h1", { children: "Books" }), books.months.length > 0 && (_jsx("select", { "aria-label": "Month", value: books.month, onChange: (event) => setMonth(event.target.value), style: { width: "auto" }, children: books.months.map((m) => (_jsx("option", { value: m, children: formatMonth(m) }, m))) }))] }), _jsxs("div", { className: "card", children: [_jsx("span", { className: "eyebrow", children: formatMonth(books.month) }), _jsx("p", { className: "receipt-amount", style: { marginTop: "0.3rem" }, children: formatUsd(books.monthTotal) }), _jsxs("p", { className: "small hushed", style: { marginTop: "0.3rem" }, children: [formatUsd(books.previousMonthTotal), " in ", formatMonth(books.previousMonth), delta !== null && delta !== 0n && (_jsxs(_Fragment, { children: [" \u00B7 ", delta > 0n ? "up" : "down", " ", formatUsd(delta > 0n ? delta : -delta)] }))] })] }), books.byCategory.length > 0 && (_jsxs("section", { className: "stack-sm", children: [_jsx("h2", { children: "By category" }), _jsx("div", { className: "bars", children: books.byCategory.map((row) => (_jsxs("div", { className: "bar", children: [_jsx("span", { className: "t", children: row.category }), _jsx("span", { className: "track", children: _jsx("span", { className: "fill", style: {
                                                    width: largest === 0n
                                                        ? "0%"
                                                        : `${Number((BigInt(row.total) * 100n) / largest)}%`,
                                                } }) }), _jsx("span", { className: "a", children: formatUsd(row.total) })] }, row.category))) })] })), books.byPayee.length > 0 && (_jsxs("section", { className: "stack-sm", children: [_jsx("h2", { children: "By recipient" }), _jsx("div", { className: "list", children: books.byPayee.map((row) => (_jsxs("div", { className: "spread", children: [_jsxs("span", { children: [_jsx("strong", { children: row.label }), _jsx("br", {}), _jsxs("span", { className: "small hushed", children: [row.count, " ", row.count === 1 ? "payout" : "payouts"] })] }), _jsx("span", { className: "figure", children: formatUsd(row.total) })] }, `${row.label}-${row.payee}`))) })] })), _jsxs("section", { className: "stack-sm", children: [_jsxs("h2", { children: ["Contractors, ", books.yearToDate.year] }), _jsx("p", { className: "small hushed", children: "A US business must file a 1099-NEC for any contractor paid $600 or more in a calendar year. This is that list, ready in January rather than assembled in it." }), books.yearToDate.contractors.length === 0 ? (_jsx("div", { className: "empty", children: _jsx("p", { className: "small", children: "No contractor payouts this year yet." }) })) : (_jsx("div", { className: "scroll", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Contractor" }), _jsx("th", { children: "Payouts" }), _jsx("th", { children: "Paid this year" }), _jsx("th", { children: "1099" })] }) }), _jsx("tbody", { children: books.yearToDate.contractors.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: row.label }), _jsx("td", { className: "n", children: row.count }), _jsx("td", { className: "n", children: formatUsd(row.total) }), _jsx("td", { children: row.over1099 ? (_jsx("span", { className: "chip chip-solar", children: "Required" })) : (_jsx("span", { className: "chip", children: "Under" })) })] }, row.payee))) })] }) })), _jsxs("p", { className: "small hushed", children: ["Year to date, all categories: ", _jsx("strong", { children: formatUsd(books.yearToDate.total) })] })] }), _jsx("a", { className: "btn btn-ghost", href: api.csvUrl(account.address), download: true, children: "Export for my accountant" })] }))] }));
}
