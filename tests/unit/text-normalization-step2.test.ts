import { describe, expect, it } from "vitest";
import { normalizeMultiline, normalizeSearch, normalizeSingleLine } from "@/lib/text-normalization";

describe("planner text normalization", () => {
  it("normalizes single-line task names and removes controls", () => {
    expect(normalizeSingleLine("  Важная\t\u0000 задача  ")).toBe("Важная задача");
    expect(normalizeSingleLine("   ")).toBeNull();
  });
  it("keeps allowed newlines in reflection fields", () => {
    expect(normalizeMultiline("  Первая\r\nВторая\u0000  ")).toBe("Первая\nВторая");
  });
  it("uses NFKC and Russian case folding for search", () => {
    expect(normalizeSearch("ＡБВ Ёж")).toBe("aбв ёж");
  });
});
