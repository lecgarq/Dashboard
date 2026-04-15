// app/api/chat/media/route.ts
// Proxies Google Chat attachment downloads.
// - DRIVE_FILE: uses the general Google Drive OAuth (GMAIL_REFRESH_TOKEN)
// - UPLOADED_CONTENT: uses the Chat API user's OAuth to call media.download

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { buildGoogleDriveOAuthClient } from "@/lib/server/google-service-auth";
import { createLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";
const logger = createLogger("chat-media-route");

function getDriveAuth() {
  try {
    return buildGoogleDriveOAuthClient();
  } catch {
    return null;
  }
}

async function getChatAuth(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google-chat" },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });
  if (!account?.refresh_token) return null;

  const clientId =
    process.env.GOOGLE_CHAT_CLIENT_ID?.trim() ??
    process.env["GOOGLE_CLOUD_CLIENT-ID"]?.trim() ??
    process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret =
    process.env.GOOGLE_CHAT_CLIENT_SECRET?.trim() ??
    process.env["GOOGLE_CLOUD-CLIENT-SECRET"]?.trim() ??
    process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) return null;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  return oauth2;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const source = searchParams.get("source"); // "DRIVE_FILE" or "UPLOADED_CONTENT"
  const driveFileId = searchParams.get("driveFileId");
  const resourceName =
    searchParams.get("resourceName") ?? searchParams.get("name");

  try {
    if (source === "DRIVE_FILE" && driveFileId) {
      return await proxyDriveFile(driveFileId);
    }

    if (source === "UPLOADED_CONTENT" && resourceName) {
      return await proxyChatAttachment(session.user.id, resourceName);
    }

    return NextResponse.json(
      { error: "Missing source, driveFileId, or resourceName param" },
      { status: 400 }
    );
  } catch (err: any) {
    logger.error("Media proxy failed", {
      error: err,
      source,
      driveFileId,
      resourceName,
    });
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 502 }
    );
  }
}

async function proxyDriveFile(fileId: string) {
  const driveAuth = getDriveAuth();
  if (!driveAuth) {
    return NextResponse.json(
      { error: "Drive OAuth not configured" },
      { status: 500 }
    );
  }

  const drive = google.drive({ version: "v3", auth: driveAuth });

  // First get metadata to know content type and if it's a Google Workspace file
  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink,thumbnailLink,iconLink",
  });

  const mimeType = meta.data.mimeType ?? "application/octet-stream";

  // Google Workspace files (Docs, Sheets, Slides) can't be downloaded directly
  // Return metadata with links instead
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    return NextResponse.json({
      type: "google_workspace",
      mimeType,
      name: meta.data.name,
      webViewLink: meta.data.webViewLink,
      thumbnailLink: meta.data.thumbnailLink,
      iconLink: meta.data.iconLink,
    });
  }

  // Regular file — stream it
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.data as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return new Response(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${meta.data.name ?? "file"}"`,
    },
  });
}

async function proxyChatAttachment(userId: string, resourceName: string) {
  const chatAuth = await getChatAuth(userId);
  if (!chatAuth) {
    return NextResponse.json(
      { error: "Chat OAuth not available" },
      { status: 500 }
    );
  }

  // Chat API media.download: GET https://chat.googleapis.com/v1/media/{resourceName}?alt=media
  const { token } = await chatAuth.getAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "Could not get access token" },
      { status: 500 }
    );
  }

  const url = `https://chat.googleapis.com/v1/media/${resourceName}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error("Chat media download failed", {
      status: response.status,
      resourceName,
      responseText: text,
    });
    return NextResponse.json(
      { error: `Download failed (${response.status})` },
      { status: response.status }
    );
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const body = await response.arrayBuffer();

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
