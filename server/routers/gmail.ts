import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  buildUserGmailApi,
  listRecentMessages,
  getMessage,
  sendGmailMessage,
} from "@/lib/server/email";
import { GMAIL_SCOPE } from "@/lib/google/oauth";
import { TRPCError } from "@trpc/server";

async function getUserGmailApi(userId: string, db: { account: { findFirst: Function } }) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true, access_token: true, scope: true },
  });

  if (!account?.refresh_token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "gmail_access_required",
    });
  }

  const hasGmailScope = (account.scope ?? "").includes(GMAIL_SCOPE);
  if (!hasGmailScope) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "gmail_access_required",
    });
  }

  return buildUserGmailApi({
    refreshToken: account.refresh_token,
    accessToken: account.access_token,
  });
}

export const gmailRouter = router({
  getRecent: protectedProcedure
    .input(z.object({ maxResults: z.number().optional().default(15) }))
    .query(async ({ input, ctx }) => {
      const gmailApi = await getUserGmailApi(ctx.session.user.id, ctx.db);
      return listRecentMessages(input.maxResults, gmailApi);
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const gmailApi = await getUserGmailApi(ctx.session.user.id, ctx.db);
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
        to: z.string().email(),
        subject: z.string().min(1),
        html: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await sendGmailMessage(input.to, input.subject, input.html);
        return { success: true };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send email.",
          cause: err,
        });
      }
    }),
});
