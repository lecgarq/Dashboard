import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

// Proxy LOD family images — imagePath is stored as a Google Drive file ID
// Falls back gracefully if Drive is not configured
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

  if (!folderId) {
    return new NextResponse("LOD image storage not configured", { status: 404 });
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
