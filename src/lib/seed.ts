import type { PrismaClient } from "@prisma/client";
import { EXPECTED_PROMPTS_SHA256, EXPECTED_QUOTES_SHA256, quotes, reflectionPrompts, SEED_VERSION } from "@/data/seed";
import { sha256 } from "@/lib/checksum";

export function currentSeedChecksums() {
  return {
    prompts: sha256(reflectionPrompts),
    quotes: sha256(quotes)
  };
}

export function assertSeedSource(): void {
  const ids = [...reflectionPrompts.map((item) => item.id), ...quotes.map((item) => item.id)];
  if (reflectionPrompts.length !== 13) throw new Error("SEED_PROMPT_COUNT");
  if (quotes.length !== 60) throw new Error("SEED_QUOTE_COUNT");
  if (new Set(ids).size !== ids.length) throw new Error("SEED_DUPLICATE_ID");
  const categories = quotes.reduce<Record<string, number>>((result, quote) => {
    result[quote.category] = (result[quote.category] ?? 0) + 1;
    return result;
  }, {});
  if (categories.HUMOR !== 24 || categories.MOTIVATION !== 18 || categories.PHILOSOPHY !== 18) {
    throw new Error("SEED_CATEGORY_DISTRIBUTION");
  }
  for (const quote of quotes) {
    if (!quote.sourceUrl.startsWith("https://www.gutenberg.org/")) throw new Error("SEED_SOURCE_URL");
    if (!quote.author || !quote.translationRu || !quote.sourceExcerpt || !quote.workTitle || !quote.locator) {
      throw new Error("SEED_REQUIRED_FIELD");
    }
  }
  const sums = currentSeedChecksums();
  if (sums.prompts !== EXPECTED_PROMPTS_SHA256) throw new Error("SEED_PROMPT_CHECKSUM");
  if (sums.quotes !== EXPECTED_QUOTES_SHA256) throw new Error("SEED_QUOTE_CHECKSUM");
}

export async function applySeed(client: PrismaClient): Promise<void> {
  assertSeedSource();
  await client.$transaction(async (tx) => {
    for (const prompt of reflectionPrompts) {
      await tx.reflectionPrompt.upsert({
        where: { id: prompt.id },
        update: {},
        create: { ...prompt, seedVersion: SEED_VERSION }
      });
    }
    for (const quote of quotes) {
      await tx.quote.upsert({ where: { id: quote.id }, update: {}, create: quote });
    }
  });
}
