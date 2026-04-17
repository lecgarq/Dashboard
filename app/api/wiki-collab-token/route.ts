import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "@auth/core/jwt";
import { getAuthSecret } from "@/lib/auth-env";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { canEditWikiModule } from "@/lib/server/wiki-access";

export const runtime = "nodejs";

const WIKI_COLLAB_TOKEN_SALT = "wiki-collab-token";
const WIKI_COLLAB_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 12;

const requestSchema = z.object({
  module: z.enum(["clash", "sim"]),
  sectionId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsedBody: z.infer<typeof requestSchema>;
  try {
    parsedBody = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!canEditWikiModule(session.user, parsedBody.module)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const section =
    parsedBody.module === "clash"
      ? await db.clashWiki.findUnique({
          where: { id: parsedBody.sectionId },
          select: { id: true },
        })
      : await db.simWiki.findUnique({
          where: { id: parsedBody.sectionId },
          select: { id: true },
        });

  if (!section) {
    return NextResponse.json({ error: "Wiki section not found" }, { status: 404 });
  }

  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json({ error: "Auth secret not configured" }, { status: 500 });
  }

  const roomName = `wiki-room-${parsedBody.module}-${parsedBody.sectionId}`;
  const token = await encode({
    secret,
    salt: WIKI_COLLAB_TOKEN_SALT,
    maxAge: WIKI_COLLAB_TOKEN_MAX_AGE_SECONDS,
    token: {
      sub: session.user.id,
      room: roomName,
      module: parsedBody.module,
      sectionId: parsedBody.sectionId,
      role: session.user.role,
      email: session.user.email ?? null,
    },
  });

  return NextResponse.json({
    token,
    roomName,
    expiresIn: WIKI_COLLAB_TOKEN_MAX_AGE_SECONDS,
  });
}
