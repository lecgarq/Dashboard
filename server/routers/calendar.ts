import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  getUserCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listCalendarRooms,
} from "@/lib/google-calendar";
import { listCalendarGuestDirectory } from "@/lib/google-directory";
import { IntegrationError } from "@/lib/server/integration-errors";

function toCalendarRouterError(error: unknown) {
  if (error instanceof IntegrationError) {
    return new TRPCError({
      code:
        error.code === "reconnect_required" || error.code === "config_missing"
          ? "PRECONDITION_FAILED"
          : "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Google Calendar request failed.",
    cause: error instanceof Error ? error : undefined,
  });
}

export const calendarRouter = router({
  getEvents: protectedProcedure
    .input(
      z.object({
        timeMin: z.string(),
        timeMax: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) return [];
      return getUserCalendarEvents(userId, input.timeMin, input.timeMax);
    }),

  listRooms: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      return {
        status: "not_linked" as const,
        rooms: [],
        message: "Link your Google account to browse meeting rooms.",
      };
    }
    return listCalendarRooms(userId);
  }),

  getGuestDirectory: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    if (!userId) {
      return {
        status: "not_linked" as const,
        people: [],
        departments: [],
        costCenters: [],
        message: "Link your Google account to search your Workspace directory.",
      };
    }
    return listCalendarGuestDirectory(userId);
  }),

  createEvent: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z.string(),
        end: z.string(),
        allDay: z.boolean().optional(),
        addMeetLink: z.boolean().optional(),
        roomEmail: z.string().optional(),
        attendeeEmails: z.array(z.string().email()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new Error("Not authenticated");
      try {
        return await createCalendarEvent(userId, input);
      } catch (error) {
        throw toCalendarRouterError(error);
      }
    }),

  updateEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        allDay: z.boolean().optional(),
        addMeetLink: z.boolean().optional(),
        roomEmail: z.string().optional(),
        attendeeEmails: z.array(z.string().email()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new Error("Not authenticated");
      try {
        return await updateCalendarEvent(userId, input);
      } catch (error) {
        throw toCalendarRouterError(error);
      }
    }),

  deleteEvent: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new Error("Not authenticated");
      try {
        await deleteCalendarEvent(userId, input.eventId);
      } catch (error) {
        throw toCalendarRouterError(error);
      }
      return { success: true };
    }),
});
