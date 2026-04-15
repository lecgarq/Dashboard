import "server-only";
import { google } from "googleapis";
import { Readable } from "stream";
import { buildGoogleDriveOAuthClient } from "@/lib/server/google-service-auth";

export async function upsertDriveJsonFile(fileName: string, data: unknown): Promise<void> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) return; // Drive not configured

  const auth = buildGoogleDriveOAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const content = JSON.stringify(data, null, 2);
  const media = {
    mimeType: "application/json",
    body: Readable.from([content]),
  };

  // Search for existing file by name in folder
  const existing = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });

  const fileId = existing.data.files?.[0]?.id;
  if (fileId) {
    await drive.files.update({ fileId, media });
  } else {
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media,
      fields: "id",
    });
  }
}
