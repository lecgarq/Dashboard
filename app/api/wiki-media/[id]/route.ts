import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/server/auth";
import { createGoogleIntegrationError, getIntegrationErrorResponse } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";
import { buildWikiMediaDriveOAuthClient } from "@/lib/server/wiki-media-auth";
import { getWikiMediaFolderId } from "@/lib/server/wiki-media-drive";

export const runtime = "nodejs";
const logger = createLogger("wiki-media-proxy-route");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // In Next 15, dynamic route parameters must be awaited or correctly typed
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
    }

    const driveAuth = await buildWikiMediaDriveOAuthClient(session.user.id);
    const drive = google.drive({ version: "v3", auth: driveAuth });

    // Stream the file metadata to get the original mime type
    const meta = await drive.files.get({
      fileId: id,
      fields: "mimeType,name,parents",
    });

    const mediaFolderId = await getWikiMediaFolderId(drive, { createIfMissing: false });
    const parentIds = meta.data.parents ?? [];
    if (!mediaFolderId || !parentIds.includes(mediaFolderId)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const file = await drive.files.get(
      { fileId: id, alt: "media" },
      { responseType: "stream" }
    );

    // Convert the stream from the googleapis response to a Web ReadableStream
    // which Next.js can return in a standard Response
    const stream = file.data as any;
    
    // We create a custom readable stream so Next isn't confused
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        stream.on('end', () => {
          controller.close();
        });
        stream.on('error', (err: any) => {
          controller.error(err);
        });
      }
    });

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": meta.data.mimeType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable", 
        // Force inline display instead of download for images/video
        "Content-Disposition": `inline; filename="${meta.data.name || id}"`
      },
    });
  } catch (error: unknown) {
    const integrationError = createGoogleIntegrationError("Google Drive", error, {
      action: "fetch wiki media",
      reconnectMessage:
        "Refresh the Google Drive token with drive scope to fetch wiki media.",
      unavailableMessage: "Google Drive could not fetch the wiki media right now.",
      configMessage: "Google Drive is not configured for wiki media access.",
    });

    logger.error("Wiki media proxy failed", {
      error: integrationError,
    });

    const response = getIntegrationErrorResponse(
      integrationError,
      "Google Drive could not fetch the wiki media right now."
    );
    return NextResponse.json(response.body, { status: response.status });
  }
}
