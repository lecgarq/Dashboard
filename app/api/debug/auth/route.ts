import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const userId = session.user.id;
  const accounts = await db.account.findMany({
    where: { userId, provider: { in: ["google", "google-chat"] } },
    select: {
      provider: true,
      scope: true,
      expires_at: true,
      refresh_token: true,
    },
  });

  const debugInfo = {
    userId,
    userName: session.user.name,
    userEmail: session.user.email,
    accounts: accounts.map(a => ({
      provider: a.provider,
      hasRefreshToken: !!a.refresh_token,
      expiresIn: a.expires_at ? (a.expires_at - Math.floor(Date.now() / 1000)) + "s" : "unknown",
      scopes: a.scope?.split(" ") || [],
      missingDirectoryScope: !a.scope?.includes("directory.readonly"),
    })),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(debugInfo);
}
