import { NextRequest, NextResponse } from "next/server";
import { getGmailAttachmentContent } from "@/lib/server/email";
import {
  getUserGmailApi,
  isGmailAccessRequiredError,
} from "@/lib/server/user-gmail";
import { createLogger } from "@/lib/server/logger";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const logger = createLogger("gmail-attachment-route");

function sanitizeFilename(value: string): string {
  return value.replace(/["\r\n]+/g, "").trim() || "attachment";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const messageId = searchParams.get("messageId");
  const partId = searchParams.get("partId");

  if (!messageId || !partId) {
    return NextResponse.json(
      { error: "Missing messageId or partId." },
      { status: 400 }
    );
  }

  try {
    const gmailApi = await getUserGmailApi(session.user.id, db);
    const attachment = await getGmailAttachmentContent(messageId, partId, gmailApi);
    return new Response(Uint8Array.from(attachment.buffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${sanitizeFilename(
          attachment.filename
        )}"`,
      },
    });
  } catch (error) {
    if (isGmailAccessRequiredError(error)) {
      return NextResponse.json(
        { error: "gmail_access_required" },
        { status: 403 }
      );
    }

    logger.error("Failed to proxy Gmail attachment", {
      messageId,
      partId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to fetch attachment." },
      { status: 502 }
    );
  }
}
