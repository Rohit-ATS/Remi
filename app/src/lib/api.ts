// Client for the Remi server. Same origin, so passkeys stay scoped to one rpId.

export type ServerConfig = {
  network: "mainnet" | "testnet" | "local";
  chainId: number;
  rpcUrl: string;
  payoutsAddress: `0x${string}` | null;
  tokenAddress: `0x${string}` | null;
  explorer: string | null;
  categories: string[];
  /** True only on a local chain with a funding key, so the app can offer test dollars. */
  faucet?: boolean;
};

export type Payout = {
  receipt_no: number;
  payer: string;
  payee: string;
  amount: string;
  label: string;
  memo: string;
  category: string;
  passport_eligible: boolean;
  timestamp: number;
  tx_hash: string;
  block_number: number;
};

export type Books = {
  month: string;
  previousMonth: string;
  monthTotal: string;
  previousMonthTotal: string;
  byCategory: { category: string; total: string; count: number }[];
  byPayee: { label: string; payee: string; total: string; count: number }[];
  months: string[];
  yearToDate: {
    year: string;
    total: string;
    contractors: { label: string; payee: string; total: string; count: number; over1099: boolean }[];
  };
};

export type Dashboard = {
  month: string;
  previousMonth: string;
  monthTotal: string;
  previousMonthTotal: string;
  monthDelta: string;
  byMonth: { month: string; total: string; count: number }[];
  recent: Payout[];
  lifetime: { payouts: number; total: string; firstPayoutAt: number | null };
  yearToDate: { year: string; total: string; contractorTotal: string };
  people: { payees: number; contractors: number };
  needs1099: { label: string; payee: string; total: string; count: number }[];
  approaching1099: { label: string; payee: string; total: string; remaining: string }[];
};

export type Assessment = {
  totalEarned: string;
  payoutCount: number;
  clientCount: number;
  monthsActive: number;
  monthsObserved: number;
  firstPaidAt: number | null;
  lastPaidAt: number | null;
  medianMonthly: string;
  byMonth: { month: string; total: string; count: number }[];
  byClient: { payer: string; total: string; count: number; share: number }[];
  stabilityScore: number;
  signals: {
    regularity: number;
    concentration: number;
    trend: number;
    coverage: number;
    confidence: number;
  };
  advanceCeiling: string;
  reasons: string[];
};

export type AssistantAnswer = {
  answer: string;
  rows: { date: string; label: string; category: string; amount: string; memo: string }[];
  source: "model" | "fallback";
  note: string | null;
};

/**
 * Where the API lives.
 *
 * Empty means same origin, which is the case in development (Vite proxies /api)
 * and in any deployment that puts the server behind the same host. A static
 * host like GitHub Pages cannot run the server, so a build for one sets
 * VITE_API_BASE to the hosted server's origin.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export const apiBase = API_BASE;

/** True when the app is served from a static host with no API configured. */
export function apiIsUnconfigured(): boolean {
  return API_BASE === "" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // A non-JSON error body is not worth surfacing; the status carries enough.
    }
    throw new Error(detail);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`Invalid JSON response from ${path}`);
  }
}

export const api = {
  config: () => request<ServerConfig>("/api/config"),

  dashboard: (owner: string) => request<Dashboard>(`/api/dashboard?owner=${encodeURIComponent(owner)}`),

  payouts: (owner: string) => request<{ payouts: Payout[] }>(`/api/payouts?owner=${encodeURIComponent(owner)}`),

  books: (owner: string, month?: string) =>
    request<Books>(
      `/api/books?owner=${encodeURIComponent(owner)}${month ? `&month=${encodeURIComponent(month)}` : ""}`,
    ),

  csvUrl: (owner: string) => `${API_BASE}/api/books.csv?owner=${encodeURIComponent(owner)}`,

  receipt: (receiptNo: number) =>
    request<{ receipt: Payout; verifyUrl: string | null }>(`/api/receipt/${encodeURIComponent(receiptNo)}`),

  passport: (address: string) =>
    request<{ address: string; assessment: Assessment; payouts: Payout[] }>(
      `/api/passport/${encodeURIComponent(address)}`,
    ),

  ask: (owner: string, question: string) =>
    request<AssistantAnswer>("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ owner, question }),
    }),

  /** Local chain only: tops the signed-in account up with gas and test dollars. */
  fund: (address: string) =>
    request<{ address: string; minted: string; txs: string[] }>("/api/dev/fund", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),
};
