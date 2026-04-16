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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;
  const folderId = process.env.LOD_IMAGES_DRIVE_FOLDER_ID;

  const localImage = await readLocalImage(fileId);
  if (localImage) {
    return new NextResponse(localImage, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  if (!folderId) {
    return new NextResponse("Image not found", { status: 404 });
  }

  try {
    const { google } = await import("googleapis");
    const { buildGoogleDriveOAuthClient } = await import("@/lib/server/google-service-auth");

    const auth = buildGoogleDriveOAuthClient();
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    return new NextResponse(res.data as ArrayBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("Image not found", { status: 404 });
  }
}
