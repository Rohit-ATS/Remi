import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api.ts";
import { getStoredAccount, signOut } from "./lib/account.ts";
import { useRoute, navigate } from "./lib/router.ts";
import { Welcome } from "./screens/Welcome.tsx";
import { Home } from "./screens/Home.tsx";
import { BooksScreen } from "./screens/Books.tsx";
import { PassportScreen } from "./screens/Passport.tsx";
import { ReceiptScreen } from "./screens/Receipt.tsx";
export function App() {
    const route = useRoute();
    const [config, setConfig] = useState(null);
    const [configError, setConfigError] = useState(null);
    const [account, setAccount] = useState(() => getStoredAccount());
    useEffect(() => {
        api
            .config()
            .then(setConfig)
            .catch((error) => setConfigError(error instanceof Error
            ? `The Remi server is not reachable (${error.message}). Start it with \`npm run dev:server\`.`
            : "The Remi server is not reachable."));
    }, []);
    const onSignOut = useCallback(() => {
        signOut();
        setAccount(null);
        navigate("/");
    }, []);
    // A shared receipt opens for anyone, with no account and no server-side
    // session. It is checked before the signed-in gate on purpose: this is the
    // link a contractor is sent, and asking them to sign up to read it would
    // defeat the point.
    if (route.name === "receipt") {
        return _jsx(ReceiptScreen, { receiptNo: route.receiptNo, config: config, account: account });
    }
    if (route.name === "public-passport") {
        return _jsx(PassportScreen, { address: route.address, config: config, account: null, shared: true });
    }
    if (configError !== null) {
        return (_jsxs("main", { className: "shell", children: [_jsx(Header, { account: null }), _jsx("div", { className: "notice notice-error", children: configError })] }));
    }
    if (config === null) {
        return (_jsxs("main", { className: "shell", children: [_jsx(Header, { account: null }), _jsxs("p", { className: "hushed", children: [_jsx("span", { className: "spinner" }), " Connecting\u2026"] })] }));
    }
    if (account === null) {
        return _jsx(Welcome, { config: config, onSignedIn: setAccount });
    }
    return (_jsxs(_Fragment, { children: [route.name === "home" && (_jsx(Home, { config: config, account: account, onSignOut: onSignOut })), route.name === "books" && _jsx(BooksScreen, { config: config, account: account }), route.name === "passport" && (_jsx(PassportScreen, { address: account.address, config: config, account: account })), _jsx(TabBar, { active: route.name })] }));
}
function Header({ account }) {
    return (_jsxs("header", { className: "topbar", children: [_jsx("span", { className: "mark", children: _jsx("a", { href: "#/", children: "Remi" }) }), account !== null && _jsx("span", { className: "chip", children: account.label })] }));
}
function TabBar({ active }) {
    const tabs = [
        { href: "#/", name: "home", label: "Pay" },
        { href: "#/books", name: "books", label: "Books" },
        { href: "#/passport", name: "passport", label: "Passport" },
    ];
    return (_jsx("nav", { className: "tabs", "aria-label": "Sections", children: tabs.map((tab) => (_jsxs("a", { href: tab.href, ...(active === tab.name ? { "aria-current": "page" } : {}), children: [_jsx("span", { className: "pip", "aria-hidden": "true" }), tab.label] }, tab.name))) }));
}
