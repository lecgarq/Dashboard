import { access, readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { auth } from "@/server/auth";

export const runtime = "nodejs";

function getLocalImageRoot() {
  return process.env.LOD_LOCAL_IMAGE_ROOT?.trim() || "C:/LECG/LOD Checker/00_data/img";
}

async function readLocalImage(fileId: string) {
  const decoded = decodeURIComponent(fileId);
  const safeName = path.basename(decoded);
  if (!safeName) return null;

  const imagePath = path.join(getLocalImageRoot(), safeName);

  try {
    await access(imagePath);
    return await readFile(imagePath);
  } catch {
    return null;
  }
}

async function readDriveImageByName(filename: string): Promise<Buffer | null> {
  const folderId = process.env.LOD_IMAGES_DRIVE_FOLDER_ID?.trim();
  if (!folderId) return null;

  try {
    const { google } = await import("googleapis");
    const { buildGoogleDriveOAuthClient } = await import("@/lib/server/google-service-auth");

    const auth = buildGoogleDriveOAuthClient();
    const drive = google.drive({ version: "v3", auth });

    // Search by filename within the folder
    const list = await drive.files.list({
      q: `name='${filename.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
    });

    const fileId = list.data.files?.[0]?.id;
    if (!fileId) return null;

    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    return Buffer.from(res.data as ArrayBuffer);
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;
  const decoded = decodeURIComponent(fileId);
  const basename = path.basename(decoded);

  // 1. Try local filesystem first (fast dev path)
  const localImage = await readLocalImage(fileId);
  if (localImage) {
    return new NextResponse(localImage, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  // 2. Search Google Drive folder by filename (production path)
  const driveImage = await readDriveImageByName(basename);
  if (driveImage) {
    return new NextResponse(new Uint8Array(driveImage), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  return new NextResponse("Image not found", { status: 404 });
}
