import "server-only";

import type { drive_v3 } from "googleapis";

const WIKI_MEDIA_FOLDER_NAME = "wiki-media";

export function getConfiguredDriveFolderId() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error("Google Drive not configured");
  }
  return folderId;
}

export async function getWikiMediaFolderId(
  drive: drive_v3.Drive,
  options: { createIfMissing: boolean }
) {
  const parentFolderId = getConfiguredDriveFolderId();
  const existing = await drive.files.list({
    q: `name='${WIKI_MEDIA_FOLDER_NAME}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });

  const existingId = existing.data.files?.[0]?.id ?? null;
  if (existingId || !options.createIfMissing) {
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: WIKI_MEDIA_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  return created.data.id ?? null;
}

