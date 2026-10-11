// Clean, history-based routes with a small compatibility bridge for links
// shared before Remi moved away from hash routing. The public site still uses
// ordinary #anchors on the landing page; only a hash beginning with `#/` is a
// legacy application route.

import { useEffect, useState } from "react";

export type Route =
  | { name: "docs"; section: string }
  | { name: "landing"; anchor: string | null }
  | { name: "signin"; mode: "create" | "signin"; email: string | null; next: string }
  | { name: "home" }
  | { name: "pay"; to: string | null; amount: string | null; memo: string | null }
  | { name: "books" }
  | { name: "passport" }
  | { name: "receipt"; receiptNo: number }
  | { name: "public-passport"; address: string }
  | { name: "not-found" };

/** Routes that require an account. Everything else opens for anyone. */
export const GATED: ReadonlySet<Route["name"]> = new Set(["home", "pay", "books", "passport"]);

const FALLBACK_KEY = "remi:history-fallback";

function basePath(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}

/** Makes an in-app URL work both locally and under GitHub Pages' /Remi/ base. */
export function routeHref(to: string): string {
  // Content data also feeds the footer, where some entries are external
  // documentation links. Those must not acquire the Pages project prefix.
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(to)) return to;
  const base = basePath();
  if (to.startsWith("#")) return `${base}${to}`;
  const path = to.startsWith("/") ? to : `/${to}`;
  return path === "/" ? base : `${base.slice(0, -1)}${path}`;
}

function currentPath(): string {
  const base = basePath();
  const pathname = location.pathname;
  if (base !== "/" && pathname === base.slice(0, -1)) return "/";
  if (base !== "/" && pathname.startsWith(base)) return `/${pathname.slice(base.length)}`;
  return pathname || "/";
}

function safeNext(value: string | null): string {
  return value !== null && /^\/[\w/-]*$/.test(value) ? value : "/app";
}

/** Parses a clean URL path. `#/…` remains accepted for old pasted links. */
export function parseRoute(value: string): Route {
  const legacyPath = value.startsWith("#/") ? value.slice(1) : null;
  const url = new URL((legacyPath ?? value) || "/", "https://remi.local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const query = url.searchParams;
  const [head, tail, ...rest] = path.slice(1).split("/");

  if (path === "/") {
    const anchor = legacyPath === null ? url.hash.slice(1) : "";
    return { name: "landing", anchor: anchor === "" ? null : anchor };
  }

  if (head === "app" && tail === undefined) return { name: "home" };
  if (head === "docs" && rest.length === 0) return { name: "docs", section: tail || "overview" };
  if (head === "pay" && tail === undefined) {
    return { name: "pay", to: query.get("to"), amount: query.get("amount"), memo: query.get("memo") };
  }
  if (head === "books" && tail === undefined) return { name: "books" };
  if (head === "passport" && tail === undefined) return { name: "passport" };
  if (head === "signin" && tail === undefined) {
    return {
      name: "signin",
      mode: query.get("mode") === "signin" ? "signin" : "create",
      email: query.get("email"),
      // Only an in-app path is honoured, so a crafted link cannot bounce
      // someone off-site after they authenticate.
      next: safeNext(query.get("next")),
    };
  }
  if (head === "r" && tail !== undefined && rest.length === 0) {
    const receiptNo = Number(tail);
    if (Number.isInteger(receiptNo) && receiptNo > 0) return { name: "receipt", receiptNo };
  }
  if (head === "p" && tail !== undefined && rest.length === 0 && /^0x[0-9a-fA-F]{40}$/i.test(tail)) {
    return { name: "public-passport", address: tail.toLowerCase() };
  }
  return { name: "not-found" };
}

function takeFallbackPath(): string | null {
  try {
    const pending = sessionStorage.getItem(FALLBACK_KEY);
    if (pending !== null) sessionStorage.removeItem(FALLBACK_KEY);
    return pending;
  } catch {
    return null;
  }
}

function readRoute(): Route {
  const fallback = takeFallbackPath();
  if (fallback !== null && fallback.startsWith("/")) {
    history.replaceState(null, "", routeHref(fallback));
    return parseRoute(fallback);
  }

  // Old shared URLs keep working, but are immediately canonicalised so the
  // address bar, copied links and browser history all use the new form.
  if (location.hash.startsWith("#/")) {
    const legacyPath = location.hash.slice(1);
    history.replaceState(null, "", routeHref(legacyPath));
    return parseRoute(legacyPath);
  }
  return parseRoute(`${currentPath()}${location.search}${location.hash}`);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onChange = (): void => setRoute(readRoute());
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }, []);

  return route;
}

export function navigate(to: string): void {
  history.pushState(null, "", routeHref(to));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** The sign-in link for a given destination, with whatever is known prefilled. */
export function signInPath(
  options: { mode?: "create" | "signin"; email?: string; next?: string } = {},
): string {
  const query = new URLSearchParams();
  if (options.mode !== undefined) query.set("mode", options.mode);
  if (options.email !== undefined && options.email !== "") query.set("email", options.email);
  if (options.next !== undefined) query.set("next", options.next);
  const suffix = query.toString();
  return `/signin${suffix === "" ? "" : `?${suffix}`}`;
}

/** The sign-in href for a given destination, including the hosting base path. */
export function signInHref(
  options: { mode?: "create" | "signin"; email?: string; next?: string } = {},
): string {
  return routeHref(signInPath(options));
}

/** Keeps the viewport honest when the route changes. */
export function useScrollReset(route: Route): void {
  const key = route.name === "landing" ? `landing:${route.anchor ?? ""}` : route.name === "docs" ? `docs:${route.section}` : route.name;

  useEffect(() => {
    if (route.name === "landing" && route.anchor !== null) {
      const target = document.getElementById(route.anchor);
      if (target !== null) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    // The key collapses a route to the thing worth reacting to; re-running on
    // every object identity would fight the browser on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
