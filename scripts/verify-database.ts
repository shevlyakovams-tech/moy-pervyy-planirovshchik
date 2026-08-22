import { PrismaClient } from "@prisma/client";

type CheckRow = { integrity_check?: string; foreign_key_check?: string };

async function main(): Promise<void> {
  const client = new PrismaClient();
  try {
    await client.$queryRawUnsafe("PRAGMA foreign_keys = ON");
    await client.$queryRawUnsafe("PRAGMA journal_mode = WAL");
    await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    const integrity = await client.$queryRawUnsafe<CheckRow[]>("PRAGMA integrity_check");
    const foreignKeys = await client.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") throw new Error("SQLite integrity_check failed");
    if (foreignKeys.length !== 0) throw new Error("SQLite foreign_key_check failed");
    console.log("SQLite integrity_check=ok; foreign_key_check=empty; WAL and busy_timeout configured.");
  } finally { await client.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
