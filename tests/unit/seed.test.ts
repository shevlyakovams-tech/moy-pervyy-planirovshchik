import { describe, expect, it } from "vitest";
import { EXPECTED_PROMPTS_SHA256, EXPECTED_QUOTES_SHA256, quotes, reflectionPrompts } from "@/data/seed";
import { assertSeedSource, currentSeedChecksums } from "@/lib/seed";

describe("built-in seed", () => {
  it("contains exactly the approved questions and quote distribution", () => {
    expect(() => assertSeedSource()).not.toThrow();
    expect(reflectionPrompts).toHaveLength(13);
    expect(reflectionPrompts.filter((item) => item.kind === "FIXED")).toHaveLength(3);
    expect(reflectionPrompts.filter((item) => item.kind === "ROTATING")).toHaveLength(10);
    expect(quotes.filter((item) => item.category === "HUMOR")).toHaveLength(24);
    expect(quotes.filter((item) => item.category === "MOTIVATION")).toHaveLength(18);
    expect(quotes.filter((item) => item.category === "PHILOSOPHY")).toHaveLength(18);
  });

  it("matches immutable checksums and unique ids", () => {
    expect(currentSeedChecksums()).toEqual({ prompts: EXPECTED_PROMPTS_SHA256, quotes: EXPECTED_QUOTES_SHA256 });
    const ids = [...reflectionPrompts, ...quotes].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
