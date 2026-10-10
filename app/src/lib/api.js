// Client for the Remi server. Same origin, so passkeys stay scoped to one rpId.
async function request(path, init) {
    const response = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
        let detail = `${response.status}`;
        try {
            const body = (await response.json());
            if (body.error)
                detail = body.error;
        }
        catch {
            // A non-JSON error body is not worth surfacing; the status carries enough.
        }
        throw new Error(detail);
    }
    return (await response.json());
}
export const api = {
    config: () => request("/api/config"),
    payouts: (owner) => request(`/api/payouts?owner=${owner}`),
    payees: (owner) => request(`/api/payees?owner=${owner}`),
    books: (owner, month) => request(`/api/books?owner=${owner}${month ? `&month=${month}` : ""}`),
    csvUrl: (owner) => `/api/books.csv?owner=${owner}`,
    receipt: (receiptNo) => request(`/api/receipt/${receiptNo}`),
    passport: (address) => request(`/api/passport/${address}`),
    ask: (owner, question) => request("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ owner, question }),
    }),
    /** Nudges the indexer so a fresh payout shows up without waiting for the poll. */
    reindex: () => request("/api/reindex", { method: "POST" }),
};
