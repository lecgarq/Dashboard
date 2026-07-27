import { createUploadthing, type FileRouter } from "uploadthing/next";
import { createLogger } from "@/lib/server/logger";
import { auth } from "@/server/auth";

const f = createUploadthing();
const logger = createLogger("uploadthing-core");

async function requireEditorSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "EDITOR") {
    throw new Error("Forbidden");
  }

  return { userId: session.user.id };
}

export const ourFileRouter = {
  familyMedia: f({
    image: { maxFileSize: "16MB", maxFileCount: 10 },
    video: { maxFileSize: "256MB", maxFileCount: 2 },
    "application/pdf": { maxFileSize: "32MB", maxFileCount: 5 },
  })
    .middleware(requireEditorSession)
    .onUploadComplete(async ({ metadata, file }) => {
      logger.info("Family media upload complete", {
        userId: metadata.userId,
        url: file.url,
        name: file.name,
        type: file.type,
      });
      return { uploadedBy: metadata.userId, url: file.url };
    }),

  wikiMedia: f({
    image: { maxFileSize: "32MB" },
    video: { maxFileSize: "1GB" },
  })
    .middleware(requireEditorSession)
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
