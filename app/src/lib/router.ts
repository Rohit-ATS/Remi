// A hash router in thirty lines.
//
// Hash routing rather than history routing because the two public surfaces —
// a shared receipt and a shared Passport — have to open from a pasted link on
// any static host, with no server rewrite rules to get wrong on demo day.

import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "books" }
  | { name: "passport" }
  | { name: "receipt"; receiptNo: number }
  | { name: "public-passport"; address: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  const [head, tail] = path.split("/");

  if (head === "books") return { name: "books" };
  if (head === "passport") return { name: "passport" };
  if (head === "r" && tail !== undefined) {
    const n = Number(tail);
    if (Number.isInteger(n) && n > 0) return { name: "receipt", receiptNo: n };
  }
  if (head === "p" && tail !== undefined && /^0x[0-9a-fA-F]{40}$/.test(tail)) {
    return { name: "public-passport", address: tail.toLowerCase() };
  }
  return { name: "home" };
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
