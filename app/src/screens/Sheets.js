import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { formatUsd } from "../lib/money.ts";
export function Sheet({ children, onClose }) {
    // Escape closes, and the backdrop is not a click target for dismissal: a
    // mis-tap next to the Confirm button should never silently cancel a payout.
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (_jsx("div", { className: "sheet-backdrop", role: "dialog", "aria-modal": "true", children: _jsxs("div", { className: "sheet", children: [_jsx("span", { className: "sheet-handle", "aria-hidden": "true" }), children] }) }));
}
export function ConfirmSheet({ pending, categories, networkFee, busy, error, needsApproval, onCategory, onConfirm, onClose, }) {
    return (_jsxs(Sheet, { onClose: onClose, children: [_jsxs("div", { className: "stack-sm", children: [_jsx("p", { className: "eyebrow", children: "Confirm payout" }), _jsx("p", { className: "receipt-amount", children: formatUsd(pending.amount) }), _jsxs("p", { className: "hushed", children: ["to ", pending.entry?.name ?? pending.label, pending.entry?.country ? ` · ${pending.entry.country}` : ""] })] }), _jsxs("dl", { style: { margin: 0 }, children: [pending.memo !== "" && (_jsxs("div", { className: "kv", children: [_jsx("dt", { children: "For" }), _jsx("dd", { children: pending.memo })] })), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Network fee" }), _jsx("dd", { children: networkFee ?? "—" })] }), _jsxs("div", { className: "kv", children: [_jsx("dt", { children: "Arrives in" }), _jsx("dd", { children: "about 1 second" })] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "category", children: "Category" }), _jsx("select", { id: "category", value: pending.category, onChange: (event) => onCategory(event.target.value), children: categories.map((category) => (_jsx("option", { value: category, children: category }, category))) })] }), needsApproval && (_jsx("div", { className: "notice notice-solar", children: "First payout from this account needs a one-time approval. Confirming will ask for Face ID twice: once to approve, once to pay." })), error !== null && _jsx("div", { className: "notice notice-error", children: error }), _jsx("button", { type: "button", className: "btn btn-solar btn-block", onClick: onConfirm, disabled: busy, children: busy ? _jsx("span", { className: "spinner" }) : "Confirm with Face ID" }), _jsx("button", { type: "button", className: "btn btn-ghost btn-block", onClick: onClose, disabled: busy, children: "Cancel" })] }));
}
/**
 * The unknown-payee path. A name the parser read but the book does not know
 * opens this rather than failing, so the payout continues in one flow.
 */
export function PayeeSheet({ label, busy, error, onSave, onClose, }) {
    const [name, setName] = useState(label);
    const [address, setAddress] = useState("");
    const [country, setCountry] = useState("");
    const valid = /^0x[0-9a-fA-F]{40}$/.test(address.trim()) && name.trim() !== "";
    return (_jsxs(Sheet, { onClose: onClose, children: [_jsxs("div", { className: "stack-sm", children: [_jsx("p", { className: "eyebrow", children: "New recipient" }), _jsxs("h2", { children: ["Who is ", label, "?"] }), _jsxs("p", { className: "hushed small", children: ["Saved once, then ", label, " is just a name you can say. The name and country stay encrypted on this device and never reach the server."] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "payee-name", children: "Full name" }), _jsx("input", { id: "payee-name", value: name, onChange: (event) => setName(event.target.value), placeholder: "Maria Santos" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "payee-address", children: "Where to send it" }), _jsx("input", { id: "payee-address", value: address, onChange: (event) => setAddress(event.target.value), placeholder: "0x\u2026", spellCheck: false, autoCapitalize: "none" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "payee-country", children: "Country" }), _jsx("input", { id: "payee-country", value: country, onChange: (event) => setCountry(event.target.value), placeholder: "Philippines" })] }), error !== null && _jsx("div", { className: "notice notice-error", children: error }), _jsx("button", { type: "button", className: "btn btn-primary btn-block", disabled: !valid || busy, onClick: () => onSave({
                    label,
                    name: name.trim(),
                    address: address.trim(),
                    country: country.trim(),
                }), children: busy ? _jsx("span", { className: "spinner" }) : "Save and continue" }), _jsx("button", { type: "button", className: "btn btn-ghost btn-block", onClick: onClose, disabled: busy, children: "Cancel" })] }));
}
