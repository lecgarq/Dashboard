import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const health: any = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
    },
  };

  try {
    await db.$queryRaw`SELECT 1`;
    health.services.database = "connected";
  } catch (err) {
    health.status = "error";
    health.services.database = "error";
    console.error("[health] Database health check failed:", err);
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
