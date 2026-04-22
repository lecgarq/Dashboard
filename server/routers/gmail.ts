import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  archiveGmailMessage,
  listRecentMessages,
  getMessage,
  markGmailMessageRead,
  markGmailMessageUnread,
  sendGmailMessage,
  trashGmailMessage,
} from "@/lib/server/email";
import {
  getUserGmailApi,
  isGmailAccessRequiredError,
} from "@/lib/server/user-gmail";
import { TRPCError } from "@trpc/server";

const emailListSchema = z.array(z.string().trim().email()).min(1).max(50);
const optionalEmailListSchema = z.array(z.string().trim().email()).max(50).optional();
const messageIdSchema = z.object({ id: z.string().min(1) });

async function getUserGmailApiOrThrow(userId: string, db: Parameters<typeof getUserGmailApi>[1]) {
  try {
    return await getUserGmailApi(userId, db);
  } catch (error) {
    if (isGmailAccessRequiredError(error)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "gmail_access_required",
      });
    }
    throw error;
  }
}

function toInternalError(message: string, cause: unknown) {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause,
  });
}

export const gmailRouter = router({
  getRecent: protectedProcedure
    .input(
      z.object({
        maxResults: z.number().int().min(1).max(50).optional().default(20),
        query: z.string().trim().max(256).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
      return listRecentMessages(input.maxResults, gmailApi, input.query);
    }),

  getDetail: protectedProcedure
    .input(messageIdSchema)
    .query(async ({ input, ctx }) => {
      const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
      const msg = await getMessage(input.id, gmailApi);
      if (!msg) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email message not found.",
        });
      }
      return msg;
    }),

  send: protectedProcedure
    .input(
      z.object({
        to: emailListSchema,
        cc: optionalEmailListSchema,
        bcc: optionalEmailListSchema,
        subject: z.string().trim().min(1),
        html: z.string().min(1),
        threadId: z.string().min(1).optional(),
        inReplyTo: z.string().min(1).optional(),
        references: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
        const result = await sendGmailMessage(
          {
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            subject: input.subject,
            html: input.html,
            threadId: input.threadId,
            inReplyTo: input.inReplyTo,
            references: input.references,
          },
          gmailApi
        );
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw toInternalError("Failed to send email.", err);
      }
    }),

  markRead: protectedProcedure.input(messageIdSchema).mutation(async ({ input, ctx }) => {
    try {
      const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
      await markGmailMessageRead(input.id, gmailApi);
      return { success: true };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw toInternalError("Failed to mark email as read.", err);
    }
  }),

  markUnread: protectedProcedure.input(messageIdSchema).mutation(async ({ input, ctx }) => {
    try {
      const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
      await markGmailMessageUnread(input.id, gmailApi);
      return { success: true };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw toInternalError("Failed to mark email as unread.", err);
    }
  }),

  archive: protectedProcedure.input(messageIdSchema).mutation(async ({ input, ctx }) => {
    try {
      const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
      await archiveGmailMessage(input.id, gmailApi);
      return { success: true };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw toInternalError("Failed to archive email.", err);
    }
  }),

  trash: protectedProcedure.input(messageIdSchema).mutation(async ({ input, ctx }) => {
    try {
      const gmailApi = await getUserGmailApiOrThrow(ctx.session.user.id, ctx.db);
      await trashGmailMessage(input.id, gmailApi);
      return { success: true };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw toInternalError("Failed to move email to trash.", err);
    }
  }),
});
