import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { listRecentMessages, getMessage, sendGmailMessage } from "@/lib/email";
import { TRPCError } from "@trpc/server";

export const gmailRouter = router({
  getRecent: protectedProcedure
    .input(z.object({ maxResults: z.number().optional().default(15) }))
    .query(async ({ input }) => {
      return listRecentMessages(input.maxResults);
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const msg = await getMessage(input.id);
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
