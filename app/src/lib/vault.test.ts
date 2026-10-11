import { describe, expect, it } from "vitest";
import { upsertEntry, findEntry, type PayeeEntry } from "./vault.ts";

const sampleEntry: PayeeEntry = {
  label: "Maria",
  address: "0x1111111111111111111111111111111111111111",
  name: "Maria Santos",
  country: "Philippines",
};

describe("vault payee book helpers", () => {
  it("upsertEntry adds new entry to empty or existing book", () => {
    const book: PayeeEntry[] = [];
    const updated = upsertEntry(book, sampleEntry);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toEqual(sampleEntry);

    const secondEntry: PayeeEntry = {
      label: "Ben",
      address: "0x2222222222222222222222222222222222222222",
      name: "Ben Taylor",
      country: "United Kingdom",
    };
    const withTwo = upsertEntry(updated, secondEntry);
    expect(withTwo).toHaveLength(2);
    expect(withTwo[1]).toEqual(secondEntry);
  });

  it("upsertEntry replaces existing entry case-insensitively by label", () => {
    const book: PayeeEntry[] = [sampleEntry];
    const replacement: PayeeEntry = {
      label: "maria",
      address: "0x3333333333333333333333333333333333333333",
      name: "Maria Updated",
      country: "Philippines",
      note: "new wallet",
    };
    const updated = upsertEntry(book, replacement);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.address).toBe("0x3333333333333333333333333333333333333333");
    expect(updated[0]!.name).toBe("Maria Updated");
    expect(updated[0]!.note).toBe("new wallet");
  });

  it("findEntry finds entry case-insensitively", () => {
    const book: PayeeEntry[] = [sampleEntry];
    expect(findEntry(book, "Maria")).toEqual(sampleEntry);
    expect(findEntry(book, "maria")).toEqual(sampleEntry);
    expect(findEntry(book, "MARIA")).toEqual(sampleEntry);
    expect(findEntry(book, "Unknown")).toBeUndefined();
  });
});
