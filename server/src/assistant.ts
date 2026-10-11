// The assistant. Answers questions about settled payouts.
//
// THE HARD BOUNDARY, enforced structurally rather than by prompt:
// this module imports nothing that can sign, send, or write. It receives rows
// and returns prose. There is no tool-calling interface, so there is no path
// from a model output to a state change — which matters because the composer
// routes arbitrary user text here, and a model that can move money is one
// prompt injection away from a very bad demo.
//
// The numbers are never the model's. `facts` is computed before the model is
// called, the model is told to use only those figures, and the API hands the
// facts back to the client alongside the prose so every claim is checkable.

import type { Config } from "./config.ts";
import type { PayoutRow } from "./db.ts";

export type AssistantFacts = {
  rowCount: number;
  totalMinor: string;
  byCategory: Record<string, string>;
  byPayee: Record<string, string>;
  byMonth: Record<string, string>;
  countries: Record<string, string>;
  range: { from: string | null; to: string | null };
};

export type AssistantAnswer = {
  answer: string;
  facts: AssistantFacts;
  rows: { date: string; label: string; category: string; amount: string; memo: string }[];
  source: "model" | "fallback";
  note: string | null;
};

function usd(minor: string): string {
  const v = BigInt(minor);
  const whole = v / 1_000_000n;
  const cents = (v % 1_000_000n) / 10_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

function iso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function addTo(map: Record<string, string>, key: string, amount: bigint): void {
  const current = Object.hasOwn(map, key) ? BigInt(map[key]!) : 0n;
  map[key] = (current + amount).toString();
}

/** Aggregates the rows the model is allowed to talk about. */
export function summarise(rows: PayoutRow[]): AssistantFacts {
  let total = 0n;
  const byCategory: Record<string, string> = Object.create(null);
  const byPayee: Record<string, string> = Object.create(null);
  const byMonth: Record<string, string> = Object.create(null);

  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  for (const r of sorted) {
    const amount = BigInt(r.amount);
    total += amount;
    addTo(byCategory, r.category || "Other", amount);
    addTo(byPayee, r.label || r.payee.slice(0, 10), amount);
    addTo(byMonth, iso(r.timestamp).slice(0, 7), amount);
  }

  return {
    rowCount: rows.length,
    totalMinor: total.toString(),
    byCategory,
    byPayee,
    byMonth,
    countries: {},
    range: {
      from: sorted.length > 0 ? iso(sorted[0]!.timestamp) : null,
      to: sorted.length > 0 ? iso(sorted[sorted.length - 1]!.timestamp) : null,
    },
  };
}

const SYSTEM_PROMPT = `You answer questions about a small business's own payout history.

Rules you must follow:
- Use only the figures in the FACTS block. Never compute a new total, and never estimate.
- If the facts cannot answer the question, say exactly what is missing. "I only have payouts from this account, so I can't see that" is a correct and complete answer.
- Amounts in FACTS are integer minor units with 6 decimals. 400000000 is $400.00. Write amounts as dollars.
- Two or three sentences. No preamble, no bullet lists, no restating the question.
- Never offer to send a payment, change a record, or take any action. You can only answer.`;

function fallbackAnswer(question: string, facts: AssistantFacts): string {
  if (facts.rowCount === 0) {
    return "There are no payouts in this account yet, so there is nothing to answer from.";
  }
  const top = Object.entries(facts.byPayee).sort((a, b) =>
    BigInt(a[1]) < BigInt(b[1]) ? 1 : -1,
  )[0];
  const parts = [
    `Across ${facts.rowCount} ${facts.rowCount === 1 ? "payout" : "payouts"} between ${facts.range.from} and ${facts.range.to}, this account has sent ${usd(facts.totalMinor)}.`,
  ];
  if (top) parts.push(`The largest single recipient is ${top[0]} at ${usd(top[1])}.`);
  parts.push("The rows behind these figures are listed below.");
  return parts.join(" ");
}

/**
 * Asks the model to narrate `facts`. Falls back to a computed summary whenever
 * the model is unavailable, so the endpoint never fails and never invents.
 */
export async function answer(
  question: string,
  rows: PayoutRow[],
  config: Config,
  fetchImpl: typeof fetch = fetch,
): Promise<AssistantAnswer> {
  const facts = summarise(rows);
  const preview = [...rows]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 40)
    .map((r) => ({
      date: iso(r.timestamp),
      label: r.label || r.payee.slice(0, 10),
      category: r.category || "Other",
      amount: usd(r.amount),
      memo: r.memo,
    }));

  if (config.kimi.apiKey === null || !config.kimi.enabled) {
    return {
      answer: fallbackAnswer(question, facts),
      facts,
      rows: preview,
      source: "fallback",
      note:
        config.kimi.apiKey === null
          ? "KIMI_API_KEY is not set, so this answer was computed locally rather than written by the model."
          : "Remote model calls are disabled, so this answer was computed locally.",
    };
  }

  try {
    const response = await fetchImpl(`${config.kimi.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.kimi.apiKey}`,
      },
      body: JSON.stringify({
        model: config.kimi.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `FACTS\n${JSON.stringify(facts, null, 2)}\n\nQUESTION\n${question}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`model returned ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("model returned an empty answer");

    return { answer: text, facts, rows: preview, source: "model", note: null };
  } catch (error) {
    return {
      answer: fallbackAnswer(question, facts),
      facts,
      rows: preview,
      source: "fallback",
      note: `The model was unreachable (${error instanceof Error ? error.message : String(error)}), so this answer was computed locally.`,
    };
  }
}
