import { NextResponse } from "next/server";
import { configureSqlite, prisma } from "@/lib/prisma";
import { APP_VERSION, SCHEMA_VERSION } from "@/lib/versions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await configureSqlite();
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ status: "ok", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION });
  } catch {
    return NextResponse.json({ status: "error", appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION }, { status: 503 });
  }
}
