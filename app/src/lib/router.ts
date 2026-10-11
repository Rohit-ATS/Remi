// A hash router in a hundred lines, now carrying the whole site.
//
// Hash routing rather than history routing because the two public surfaces —
// a shared receipt and a shared Passport — have to open from a pasted link on
// any static host, with no server rewrite rules to get wrong on demo day.
//
// Since the landing page moved in, the hash has two jobs. `#/books` is a
// route; `#passport` is the landing page scrolled to its Passport section, and
// the marketing copy is full of the second kind. The leading slash is what
// tells them apart, so anything without one is an anchor on the landing page
// and is handed back as such rather than being parsed into a route that does
// not exist.

import { useEffect, useState } from "react";

export type Route =
  | { name: "docs"; section: string }
  | { name: "landing"; anchor: string | null }
  | { name: "signin"; mode: "create" | "signin"; email: string | null; next: string }
  | { name: "home" }
  /**
   * The payment screen. The three optional parts seed the composer, so a
   * shortcut elsewhere in the app is an ordinary link rather than shared state
   * — and the resulting URL can be pasted, bookmarked or reloaded.
   */
  | { name: "pay"; to: string | null; amount: string | null; memo: string | null }
  | { name: "books" }
  | { name: "passport" }
  | { name: "receipt"; receiptNo: number }
  | { name: "public-passport"; address: string };

/** Routes that require an account. Everything else opens for anyone. */
export const GATED: ReadonlySet<Route["name"]> = new Set(["home", "pay", "books", "passport"]);

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;

  // No leading slash means an in-page anchor, which only the landing page has.
  if (!raw.startsWith("/")) {
    const anchor = raw.replace(/^#/, "");
    return { name: "landing", anchor: anchor === "" ? null : anchor };
  }

  const [pathPart, queryPart = ""] = raw.slice(1).split("?");
  const query = new URLSearchParams(queryPart);
  const [head, tail] = (pathPart ?? "").split("/");

  if (head === "app") return { name: "home" };
  if (head === "docs") return { name: "docs", section: tail || "overview" };
  if (head === "pay") {
    return {
      name: "pay",
      to: query.get("to"),
      amount: query.get("amount"),
      memo: query.get("memo"),
    };
  }
  if (head === "books") return { name: "books" };
  if (head === "passport") return { name: "passport" };

  if (head === "signin") {
    const next = query.get("next");
    return {
      name: "signin",
      mode: query.get("mode") === "signin" ? "signin" : "create",
      email: query.get("email"),
      // Only an in-app path is honoured, so a crafted link cannot bounce
      // someone off-site after they authenticate.
      next: next !== null && /^\/[\w/-]*$/.test(next) ? next : "/app",
    };
  }

  if (head === "r" && tail !== undefined) {
    const n = Number(tail);
    if (Number.isInteger(n) && n > 0) return { name: "receipt", receiptNo: n };
  }
  if (head === "p" && tail !== undefined && /^0x[0-9a-fA-F]{40}$/i.test(tail)) {
    return { name: "public-passport", address: tail.toLowerCase() };
  }

  return { name: "landing", anchor: null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));

  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export function navigate(to: string): void {
  location.hash = to;
}

/** The sign-in link for a given destination, with whatever is known prefilled. */
export function signInHref(
  options: { mode?: "create" | "signin"; email?: string; next?: string } = {},
): string {
  const query = new URLSearchParams();
  if (options.mode !== undefined) query.set("mode", options.mode);
  if (options.email !== undefined && options.email !== "") query.set("email", options.email);
  if (options.next !== undefined) query.set("next", options.next);
  const suffix = query.toString();
  return `#/signin${suffix === "" ? "" : `?${suffix}`}`;
}

/**
 * Keeps the viewport honest when the route changes.
 *
 * A hash router gets no scroll restoration for free, so moving from a scrolled
 * landing page into the dashboard would otherwise land halfway down it. An
 * anchor on the landing page is the one case where the browser's own jump is
 * what we want, so it is left alone.
 */
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
