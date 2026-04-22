import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { auth } from "@/server/auth";
import { createGoogleIntegrationError, getIntegrationErrorResponse } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";
import { canEditWikiModule } from "@/lib/server/wiki-access";
import { buildWikiMediaDriveOAuthClient } from "@/lib/server/wiki-media-auth";
import { getWikiMediaFolderId } from "@/lib/server/wiki-media-drive";

export const runtime = "nodejs";
const logger = createLogger("wiki-media-route");

/**
 * POST /api/wiki-media
 * Accepts a multipart form with a `file` field.
 * Uploads the file to a "wiki-media" subfolder in the configured Google Drive folder using OAuth2.
 * Returns { url: "https://drive.google.com/uc?id=FILE_ID" }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wikiModule = request.headers.get("x-wiki-module");
    if (wikiModule !== "clash" && wikiModule !== "sim") {
      return NextResponse.json({ error: "Invalid wiki module" }, { status: 400 });
    }

    if (!canEditWikiModule(session.user, wikiModule)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const driveAuth = await buildWikiMediaDriveOAuthClient(session.user.id);
    const drive = google.drive({ version: "v3", auth: driveAuth });

    const mediaFolderId = await getWikiMediaFolderId(drive, { createIfMissing: true });
    if (!mediaFolderId) {
      return NextResponse.json(
        { error: "Wiki media folder unavailable" },
        { status: 500 }
      );
    }

    // Generate a unique name to avoid collisions
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${timestamp}-${safeName}`;

    // Read file into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Drive
    const uploaded = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [mediaFolderId],
      },
      media: {
        mimeType: file.type,
        body: Readable.from(buffer),
      },
      fields: "id,webViewLink,webContentLink",
    });

    const fileId = uploaded.data.id!;

    // Return proxy URL to securely stream through our backend to evade 3rd party cookie bugs
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const url = `${protocol}://${host}/api/wiki-media/${fileId}`;

    return NextResponse.json({ url, fileId, name: file.name });
  } catch (error: unknown) {
    const integrationError = createGoogleIntegrationError("Google Drive", error, {
      action: "upload wiki media",
      reconnectMessage:
        "Refresh the Google Drive token with drive scope to upload wiki media.",
      unavailableMessage: "Google Drive could not upload the wiki media right now.",
      configMessage: "Google Drive is not configured for wiki media uploads.",
    });

    logger.error("Wiki media upload failed", { error: integrationError });
    const response = getIntegrationErrorResponse(
      integrationError,
      "Google Drive could not upload the wiki media right now."
    );
    return NextResponse.json(response.body, { status: response.status });
  }
}
