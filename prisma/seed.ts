import { PrismaClient } from "@prisma/client";
import { applySeed } from "../src/lib/seed";

async function main(): Promise<void> {
  const client = new PrismaClient();
  try {
    await applySeed(client);
    console.log("Seed applied: 13 prompts and 60 quotes.");
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
});
