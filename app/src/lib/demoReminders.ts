// A starting set of due dates, for a demo account with an empty book.
//
// The addresses are the ones `scripts/demo.mjs` already pays on a local chain,
// so an armed reminder here pays somebody who exists, shows up in Books under
// the same recipient, and lands on a Passport that has history behind it. A
// demo whose contractors are strangers to the rest of the demo teaches the
// wrong shape.
//
// Written once, into the same encrypted book a typed reminder goes into, and
// then owned by the person: editing or deleting one sticks, and an empty book
// is not refilled behind their back.

import { newId, toDateKey, type Reminder } from "./reminders.ts";

/** Hardhat's accounts 1–3 and two more, matching scripts/demo.mjs. */
const SEEDS: ReadonlyArray<{
  label: string;
  amount: string;
  payee: string;
  day: number;
  note: string;
  autopay: boolean;
}> = [
  {
    label: "Maria Santos",
    amount: "950000000",
    payee: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    day: 1,
    note: "Monthly retainer",
    autopay: true,
  },
  {
    label: "Figma",
    amount: "90000000",
    payee: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    day: 4,
    note: "Team seats",
    autopay: true,
  },
  {
    label: "Ben Ortiz",
    amount: "400000000",
    payee: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    day: 12,
    note: "Design sprint",
    autopay: false,
  },
  {
    label: "Studio rent",
    amount: "2200000000",
    payee: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    day: 28,
    note: "Workspace",
    autopay: true,
  },
  {
    label: "Ada Nwosu",
    amount: "300000000",
    payee: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    day: 20,
    note: "Localisation",
    autopay: false,
  },
];

/**
 * The demo book, dated into the current month so it is visible on arrival.
 *
 * Everything repeats monthly, which is what a subscription is, and three of
 * the five are armed so both states are on screen without anyone configuring
 * one first.
 */
export function demoReminders(today = new Date()): Reminder[] {
  const year = today.getFullYear();
  const month = today.getMonth();
  const length = new Date(year, month + 1, 0).getDate();

  return SEEDS.map((seed) => ({
    id: newId(),
    label: seed.label,
    amount: seed.amount,
    due: toDateKey(new Date(year, month, Math.min(seed.day, length))),
    repeat: "monthly" as const,
    note: seed.note,
    payee: seed.payee,
    autopay: seed.autopay,
  }));
}
