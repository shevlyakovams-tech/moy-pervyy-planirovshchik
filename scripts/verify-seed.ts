import { PrismaClient } from "@prisma/client";
import { assertSeedSource, currentSeedChecksums } from "../src/lib/seed";
import { EXPECTED_PROMPTS_SHA256, EXPECTED_QUOTES_SHA256 } from "../src/data/seed";

async function main(): Promise<void> {
  assertSeedSource();
  const client = new PrismaClient();
  try {
    const [prompts, quotes, grouped] = await Promise.all([
      client.reflectionPrompt.count(),
      client.quote.count(),
      client.quote.groupBy({ by: ["category"], _count: { _all: true } })
    ]);
    const counts = Object.fromEntries(grouped.map((item) => [item.category, item._count._all]));
    if (prompts !== 13 || quotes !== 60 || counts.HUMOR !== 24 || counts.MOTIVATION !== 18 || counts.PHILOSOPHY !== 18) {
      throw new Error("Seed counts do not match the specification");
    }
    const sums = currentSeedChecksums();
    if (sums.prompts !== EXPECTED_PROMPTS_SHA256 || sums.quotes !== EXPECTED_QUOTES_SHA256) throw new Error("Seed checksum mismatch");
    console.log(JSON.stringify({ prompts, quotes, categories: counts, checksums: sums }));
  } finally { await client.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
