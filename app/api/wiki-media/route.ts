import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { createGoogleIntegrationError, getIntegrationErrorResponse } from "@/lib/server/integration-errors";
import { buildGoogleDriveOAuthClient } from "@/lib/server/google-service-auth";
import { createLogger } from "@/lib/server/logger";

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
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { error: "Google Drive not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const auth = buildGoogleDriveOAuthClient();
    const drive = google.drive({ version: "v3", auth });

    // Ensure a "wiki-media" subfolder exists inside the main folder
    let mediaFolderId: string;
    const subfolderQuery = await drive.files.list({
      q: `name='wiki-media' and '${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });

    if (subfolderQuery.data.files && subfolderQuery.data.files.length > 0) {
      mediaFolderId = subfolderQuery.data.files[0].id!;
    } else {
      const created = await drive.files.create({
        requestBody: {
          name: "wiki-media",
          mimeType: "application/vnd.google-apps.folder",
          parents: [folderId],
        },
        fields: "id",
      });
      mediaFolderId = created.data.id!;

      // Make the subfolder publicly readable so images render in the wiki
      await drive.permissions.create({
        fileId: mediaFolderId,
        requestBody: { role: "reader", type: "anyone" },
      });
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

    // Make file publicly readable
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

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
