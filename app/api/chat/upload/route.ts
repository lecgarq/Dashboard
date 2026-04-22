// app/api/chat/upload/route.ts
// Uploads a file to a Google Chat space via the Chat API media.upload endpoint,
// then sends a message with the attachment.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  getGoogleChatClientId,
  getGoogleChatClientSecret,
} from "@/lib/google/oauth";
import { google } from "googleapis";
import { createLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";
const logger = createLogger("chat-upload-route");

// Max 200 MB per Google Chat API docs
const MAX_FILE_SIZE = 200 * 1024 * 1024;

type UploadedAttachment = {
  attachmentDataRef: {
    resourceName?: string;
    attachmentUploadToken?: string;
  };
};

class ChatUploadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function getUploadResponseShape(uploadResult: unknown, file: File) {
  const result =
    uploadResult && typeof uploadResult === "object"
      ? (uploadResult as Record<string, unknown>)
      : null;
  const attachmentDataRef =
    result?.attachmentDataRef && typeof result.attachmentDataRef === "object"
      ? (result.attachmentDataRef as Record<string, unknown>)
      : null;

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    responseKeys: result ? Object.keys(result) : [],
    attachmentDataRefKeys: attachmentDataRef
      ? Object.keys(attachmentDataRef)
      : [],
  };
}

async function getChatAuth(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google-chat" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.refresh_token) return null;

  const clientId = getGoogleChatClientId();
  const clientSecret = getGoogleChatClientSecret();
  if (!clientId || !clientSecret) return null;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Ensure we have a valid token
  const tokenResponse = await oauth2.getAccessToken();
  return tokenResponse.token;
}

async function uploadAttachment(
  token: string,
  spaceName: string,
  file: File
): Promise<UploadedAttachment> {
  const uploadUrl =
    `https://chat.googleapis.com/upload/v1/${spaceName}/attachments:upload?uploadType=multipart`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const boundary = `----ChatUpload${Date.now()}${Math.random().toString(16).slice(2)}`;
  const metadataPart = JSON.stringify({ filename: file.name });

  const textEncoder = new TextEncoder();
  const prefix = textEncoder.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadataPart}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
  );
  const suffix = textEncoder.encode(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, fileBuffer, suffix]);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    logger.error("Attachment upload failed", {
      status: uploadResponse.status,
      fileName: file.name,
      responseText: errorText,
    });
    throw new ChatUploadError(
      `Upload failed (${uploadResponse.status})`,
      uploadResponse.status
    );
  }

  const uploadResult = (await uploadResponse.json()) as UploadedAttachment;
  const attachmentDataRef = uploadResult.attachmentDataRef;
  if (
    !attachmentDataRef ||
    (!attachmentDataRef.resourceName &&
      !attachmentDataRef.attachmentUploadToken)
  ) {
    logger.error(
      "Upload response missing attachment resource reference",
      getUploadResponseShape(uploadResult, file)
    );
    throw new ChatUploadError(
      "Upload succeeded but no attachment reference was returned.",
      502
    );
  }

  return uploadResult;
}

async function createMessageWithAttachments(
  token: string,
  spaceName: string,
  text: string,
  attachments: UploadedAttachment[]
) {
  const createUrl = `https://chat.googleapis.com/v1/${spaceName}/messages`;
  const messageBody: {
    text?: string;
    attachment?: UploadedAttachment[];
  } = {};

  if (text.trim()) {
    messageBody.text = text.trim();
  }

  if (attachments.length > 0) {
    messageBody.attachment = attachments;
  }

  const messageResponse = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messageBody),
  });

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text();
    logger.error("Message create with attachments failed", {
      status: messageResponse.status,
      attachmentCount: attachments.length,
      responseText: errorText,
    });
    throw new ChatUploadError(
      `Failed to send message with attachment (${messageResponse.status})`,
      messageResponse.status
    );
  }

  return messageResponse.json();
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const spaceName = formData.get("spaceName") as string;
  const text = ((formData.get("text") as string | null) ?? "").trim();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);
  const singleFile = formData.get("file");
  if (files.length === 0 && singleFile instanceof File) {
    files.push(singleFile);
  }

  if (!spaceName) {
    return NextResponse.json({ error: "Missing spaceName" }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${file.name} is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }
  }

  const token = await getChatAuth(session.user.id);
  if (!token) {
    return NextResponse.json(
      { error: "Google Chat not connected" },
      { status: 401 }
    );
  }

  try {
    const attachments: UploadedAttachment[] = [];
    for (const file of files) {
      attachments.push(await uploadAttachment(token, spaceName, file));
    }

    const messageResult = await createMessageWithAttachments(
      token,
      spaceName,
      text,
      attachments
    );
    return NextResponse.json({ ok: true, message: messageResult });
  } catch (err: any) {
    logger.error("Chat upload route failed", {
      error: err,
      spaceName,
      fileCount: files.length,
    });
    return NextResponse.json(
      { error: err?.message ?? "Upload failed unexpectedly" },
      { status: err instanceof ChatUploadError ? err.status : 500 }
    );
  }
}
