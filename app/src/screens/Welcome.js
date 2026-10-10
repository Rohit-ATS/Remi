import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { createAccount, describeError, signIn } from "../lib/account.ts";
export function Welcome({ config, onSignedIn, }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [name, setName] = useState("");
    const run = async (mode) => {
        setBusy(mode);
        setError(null);
        try {
            const account = mode === "create" ? await createAccount(name.trim() || "My business") : await signIn();
            onSignedIn(account);
        }
        catch (caught) {
            setError(describeError(caught));
        }
        finally {
            setBusy(null);
        }
    };
    return (_jsxs("main", { className: "shell", children: [_jsxs("header", { className: "topbar", children: [_jsx("span", { className: "mark", children: "Remi" }), config.network === "testnet" && _jsx("span", { className: "chip", children: "Testnet" })] }), _jsxs("div", { className: "stack", children: [_jsxs("div", { children: [_jsx("h1", { children: "Pay in seconds. Prove it forever." }), _jsx("p", { className: "hushed", style: { marginTop: "0.7rem" }, children: "Pay your contractors abroad by saying one sentence. Every payout also writes them an income record they own \u2014 one they can show a landlord or a lender without handing over their client list." })] }), _jsxs("div", { className: "card stack-sm", children: [_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "business-name", children: "Your business name" }), _jsx("input", { id: "business-name", value: name, onChange: (event) => setName(event.target.value), placeholder: "Vista Design Studio", autoComplete: "organization" })] }), _jsx("button", { type: "button", className: "btn btn-solar btn-block", onClick: () => void run("create"), disabled: busy !== null, children: busy === "create" ? _jsx("span", { className: "spinner" }) : "Set up with Face ID" }), _jsx("button", { type: "button", className: "btn btn-ghost btn-block", onClick: () => void run("signin"), disabled: busy !== null, children: busy === "signin" ? _jsx("span", { className: "spinner" }) : "I already have an account" })] }), error !== null && _jsx("div", { className: "notice notice-error", children: error }), _jsxs("div", { className: "receipt", "aria-hidden": "true", children: [_jsx("p", { className: "eyebrow", children: "Your payouts appear here" }), _jsx("p", { className: "receipt-amount faint", style: { marginTop: "0.4rem" }, children: "$0.00" }), _jsx("p", { className: "small faint", style: { marginTop: "0.6rem" }, children: "No account number, no seed phrase, no password. The passkey on this device is the account." })] }), _jsx("p", { className: "small faint", children: config.network === "testnet"
                            ? "Pointed at Monad testnet, so these are test dollars."
                            : "Pointed at Monad mainnet. Payouts settle in real AUSD." })] })] }));
}
