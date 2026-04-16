import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { listChatSpaces, listChatMessages, sendChatMessage } from "@/lib/google/chat";
import { getFreeBusyStatus } from "@/lib/google/calendar";

export const chatRouter = router({
  getSpaces: protectedProcedure.query(async ({ ctx }) => listChatSpaces(ctx.session.user.id)),

  getPresence: protectedProcedure
    .input(z.object({ emails: z.array(z.string().email()).max(50) }))
    .query(async ({ ctx, input }) => {
      if (input.emails.length === 0) return {};
      return getFreeBusyStatus(ctx.session.user.id, input.emails);
    }),

  getMessages: protectedProcedure
    .input(
      z.object({
        spaceName: z.string(),
        pageToken: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return listChatMessages(ctx.session.user.id, input.spaceName, input.pageToken);
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        spaceName: z.string(),
        text: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendChatMessage(ctx.session.user.id, input.spaceName, input.text);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to send the Google Chat message.",
        });
      }
    }),
});
