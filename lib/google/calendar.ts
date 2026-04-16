import "server-only";
import { google } from "googleapis";
import { db } from "@/server/db";
import { createGoogleIntegrationError } from "@/lib/server/integration-errors";
import { buildPrimaryGoogleOAuthClient } from "@/lib/server/google-service-auth";
import { createLogger } from "@/lib/server/logger";

/**
 * Build an OAuth2 client authenticated with a specific user's stored tokens.
 */
interface GoogleCalendarAccountRecord {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
}

type CalendarRoomLookupStatus = "ok" | "not_linked" | "reconnect_required";
const logger = createLogger("google-calendar");

async function getUserCalendarAccount(userId: string): Promise<GoogleCalendarAccountRecord | null> {
  return db.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });
}

function buildUserCalendarAuth(userId: string, account: GoogleCalendarAccountRecord | null) {
  if (!account?.refresh_token) return null;

  let oauth2: InstanceType<typeof google.auth.OAuth2>;
  try {
    oauth2 = buildPrimaryGoogleOAuthClient();
  } catch (error) {
    logger.error("Google OAuth config missing for calendar auth", {
      userId,
      error,
    });
    return null;
  }

  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.access_token = tokens.access_token;
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.refresh_token) data.refresh_token = tokens.refresh_token;

    if (Object.keys(data).length > 0) {
      await db.account.updateMany({
        where: { userId, provider: "google" },
        data,
      });
    }
  });

  return oauth2;
}

export interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  self?: boolean;
  resource?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  color: string | null;
  description: string | null;
  location: string | null;
  meetLink: string | null;
  attendees: CalendarAttendee[];
  organizer: { email: string; displayName?: string | null; self?: boolean } | null;
  status: string | null;
}

export interface CalendarRoom {
  id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  capacity?: number | null;
  buildingId?: string | null;
  floorName?: string | null;
  userVisibleDescription?: string | null;
}

export interface CalendarRoomsResult {
  status: CalendarRoomLookupStatus;
  rooms: CalendarRoom[];
  message?: string;
}

function buildReconnectRequiredRoomResult(
  rooms: CalendarRoom[],
  message: string
): CalendarRoomsResult {
  return {
    status: "reconnect_required",
    rooms,
    message,
  };
}

function mapEvent(event: any): CalendarEvent {
  const meetLink =
    event.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ??
    event.hangoutLink ??
    null;

  return {
    id: event.id ?? "",
    title: event.summary ?? "(No title)",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? null,
    allDay: !!event.start?.date,
    htmlLink: event.htmlLink ?? null,
    color: event.colorId ?? null,
    description: event.description ?? null,
    location: event.location ?? null,
    meetLink,
    attendees: (event.attendees ?? []).map((a: any) => ({
      email: a.email ?? "",
      displayName: a.displayName ?? null,
      responseStatus: a.responseStatus ?? null,
      self: a.self ?? false,
      resource: a.resource ?? false,
    })),
    organizer: event.organizer
      ? {
          email: event.organizer.email ?? "",
          displayName: event.organizer.displayName ?? null,
          self: event.organizer.self ?? false,
        }
      : null,
    status: event.status ?? null,
  };
}

/**
 * Check if a list of users are currently busy (in a meeting) using freeBusy.
 * Returns a map of email -> busy (true/false).
 */
export async function getFreeBusyStatus(
  userId: string,
  emails: string[]
): Promise<Record<string, boolean>> {
  if (emails.length === 0) return {};

  const account = await getUserCalendarAccount(userId);
  const auth = buildUserCalendarAuth(userId, account);
  if (!auth) return {};

  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 60 * 1000); // 5 min window

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: soon.toISOString(),
        items: emails.map((email) => ({ id: email })),
      },
    });

    const result: Record<string, boolean> = {};
    const calendars = res.data.calendars ?? {};
    for (const email of emails) {
      const busy = calendars[email]?.busy ?? [];
      result[email] = busy.length > 0;
    }
    return result;
  } catch (err) {
    const { code, message } = getGoogleApiError(err);
    logger.warn("FreeBusy query failed", { code, message, error: err });
    return {};
  }
}

function getGoogleApiError(err: unknown) {
  const error = err as {
    code?: number;
    status?: number;
    message?: string;
    response?: { status?: number; data?: { error?: { message?: string } } };
  };
  const code = error.code ?? error.status ?? error.response?.status ?? 0;
  const message =
    error.response?.data?.error?.message ?? error.message ?? "Unknown error.";
  return { code, message };
}

/**
 * Fetch Google Calendar events for a user within a date range.
 */
export async function getUserCalendarEvents(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const account = await getUserCalendarAccount(userId);
  const auth = buildUserCalendarAuth(userId, account);
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });

  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      fields:
        "items(id,summary,start,end,htmlLink,colorId,description,location,attendees,organizer,status,conferenceData,hangoutLink)",
    });

    return (res.data.items ?? []).map(mapEvent);
  } catch (err: any) {
    if (err.code === 403 || err.code === 401) {
      logger.warn("Calendar event list requires reconnect", {
        userId,
        error: err,
      });
      return [];
    }
    throw err;
  }
}

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string; // ISO string
  end: string;   // ISO string
  allDay?: boolean;
  addMeetLink?: boolean;
  roomEmail?: string;
  attendeeEmails?: string[];
}

/**
 * Create a Google Calendar event.
 */
export async function createCalendarEvent(
  userId: string,
  input: CreateEventInput
): Promise<CalendarEvent | null> {
  const account = await getUserCalendarAccount(userId);
  const auth = buildUserCalendarAuth(userId, account);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });

  const attendees: { email: string; resource?: boolean }[] = [
    ...(input.attendeeEmails ?? []).map((email) => ({ email })),
  ];
  if (input.roomEmail) {
    attendees.push({ email: input.roomEmail, resource: true });
  }

  const eventBody: any = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: input.allDay
      ? { date: input.start.split("T")[0] }
      : { dateTime: input.start, timeZone: "UTC" },
    end: input.allDay
      ? { date: input.end.split("T")[0] }
      : { dateTime: input.end, timeZone: "UTC" },
    attendees: attendees.length ? attendees : undefined,
  };

  if (input.addMeetLink) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: input.addMeetLink ? 1 : 0,
      requestBody: eventBody,
    });

    return mapEvent(res.data);
  } catch (err: any) {
    const integrationError = createGoogleIntegrationError("Google Calendar", err, {
      action: "create a calendar event",
      reconnectMessage: "Reconnect your Google account to restore Calendar access.",
      unavailableMessage: "Google Calendar could not create the event right now.",
      configMessage: "Google Calendar is not configured.",
    });
    logger.error("Calendar createEvent failed", {
      userId,
      input,
      error: integrationError,
    });
    throw integrationError;
  }
}

export interface UpdateEventInput {
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  addMeetLink?: boolean;
  roomEmail?: string;
  attendeeEmails?: string[];
}

/**
 * Update an existing Google Calendar event.
 */
export async function updateCalendarEvent(
  userId: string,
  input: UpdateEventInput
): Promise<CalendarEvent | null> {
  const account = await getUserCalendarAccount(userId);
  const auth = buildUserCalendarAuth(userId, account);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });

  // Fetch current event first
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: input.eventId,
  });

  const ev = existing.data;
  const isAllDay = input.allDay ?? !!ev.start?.date;

  const attendees: { email: string; resource?: boolean }[] = [];
  if (input.attendeeEmails !== undefined) {
    attendees.push(...input.attendeeEmails.map((email) => ({ email })));
  } else {
    attendees.push(
      ...((ev.attendees ?? [])
        .filter((a: any) => !a.resource)
        .map((a: any) => ({ email: a.email })))
    );
  }

  if (input.roomEmail !== undefined) {
    if (input.roomEmail) attendees.push({ email: input.roomEmail, resource: true });
  } else {
    const existingRoom = (ev.attendees ?? []).find((a: any) => a.resource);
    if (existingRoom?.email) attendees.push({ email: existingRoom.email, resource: true });
  }

  const startStr = input.start ?? (ev.start?.dateTime ?? ev.start?.date ?? "");
  const endStr = input.end ?? (ev.end?.dateTime ?? ev.end?.date ?? "");

  const eventBody: any = {
    summary: input.title ?? ev.summary,
    description: input.description !== undefined ? input.description : ev.description,
    location: input.location !== undefined ? input.location : ev.location,
    start: isAllDay
      ? { date: startStr.split("T")[0] }
      : { dateTime: startStr, timeZone: "UTC" },
    end: isAllDay
      ? { date: endStr.split("T")[0] }
      : { dateTime: endStr, timeZone: "UTC" },
    attendees: attendees.length ? attendees : undefined,
    conferenceData: ev.conferenceData,
  };

  if (input.addMeetLink && !ev.conferenceData) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  try {
    const res = await calendar.events.update({
      calendarId: "primary",
      eventId: input.eventId,
      conferenceDataVersion: 1,
      requestBody: eventBody,
    });

    return mapEvent(res.data);
  } catch (err: any) {
    const integrationError = createGoogleIntegrationError("Google Calendar", err, {
      action: "update a calendar event",
      reconnectMessage: "Reconnect your Google account to restore Calendar access.",
      unavailableMessage: "Google Calendar could not update the event right now.",
      configMessage: "Google Calendar is not configured.",
    });
    logger.error("Calendar updateEvent failed", {
      userId,
      eventId: input.eventId,
      error: integrationError,
    });
    throw integrationError;
  }
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const account = await getUserCalendarAccount(userId);
  const auth = buildUserCalendarAuth(userId, account);
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  } catch (err: any) {
    const integrationError = createGoogleIntegrationError("Google Calendar", err, {
      action: "delete a calendar event",
      reconnectMessage: "Reconnect your Google account to restore Calendar access.",
      unavailableMessage: "Google Calendar could not delete the event right now.",
      configMessage: "Google Calendar is not configured.",
    });
    logger.error("Calendar deleteEvent failed", {
      userId,
      eventId,
      error: integrationError,
    });
    throw integrationError;
  }
}

function mapVisibleCalendarRoom(room: any): CalendarRoom {
  return {
    id: room.id ?? "",
    summary: room.summary ?? room.id ?? "",
    description: room.description ?? null,
    location: room.location ?? null,
    capacity: null,
    buildingId: null,
    floorName: null,
    userVisibleDescription: room.description ?? null,
  };
}

function isResourceEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return email.includes("@resource.calendar.google.com");
}

async function listVisibleCalendarRooms(
  auth: ReturnType<typeof buildUserCalendarAuth>
): Promise<CalendarRoom[]> {
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });

  try {
    const res = await calendar.calendarList.list({
      minAccessRole: "freeBusyReader",
      maxResults: 250,
      showHidden: true,
    });

    const rooms = (res.data.items ?? []).filter(
      (cal) => isResourceEmail(cal.id)
    );

    return rooms.map(mapVisibleCalendarRoom);
  } catch (err: any) {
    logger.warn("Calendar subscribed room lookup failed", {
      error: err,
    });
    return [];
  }
}

/**
 * Discover rooms from recent calendar events.
 * Scans event attendees for resource emails — works without admin access.
 */
async function discoverRoomsFromEvents(
  auth: ReturnType<typeof buildUserCalendarAuth>
): Promise<CalendarRoom[]> {
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });

  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAhead = new Date(now);
    threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: threeMonthsAgo.toISOString(),
      timeMax: threeMonthsAhead.toISOString(),
      singleEvents: true,
      maxResults: 500,
      fields: "items(attendees)",
    });

    const seen = new Map<string, CalendarRoom>();

    for (const event of res.data.items ?? []) {
      for (const attendee of event.attendees ?? []) {
        const email = attendee.email;
        if (isResourceEmail(email) && !seen.has(email!)) {
          seen.set(email!, {
            id: email!,
            summary: attendee.displayName ?? email!.split("@")[0].replace(/[._-]/g, " "),
            description: null,
            location: null,
            capacity: null,
            buildingId: null,
            floorName: null,
            userVisibleDescription: null,
          });
        }
      }
    }

    return Array.from(seen.values());
  } catch (err: any) {
    logger.warn("Calendar room discovery from events failed", {
      error: err,
    });
    return [];
  }
}

/**
 * List available meeting rooms.
 * Merges rooms from the user's calendar list + rooms discovered from recent events.
 * No admin privileges needed.
 */
export async function listCalendarRooms(userId: string): Promise<CalendarRoomsResult> {
  const account = await getUserCalendarAccount(userId);
  if (!account) {
    return {
      status: "not_linked",
      rooms: [],
      message: "Link your Google account to browse meeting rooms.",
    };
  }

  if (!account.refresh_token) {
    return buildReconnectRequiredRoomResult(
      [],
      "Reconnect your Google account to restore Calendar access."
    );
  }

  const auth = buildUserCalendarAuth(userId, account);
  if (!auth) {
    return buildReconnectRequiredRoomResult(
      [],
      "Reconnect your Google account so the calendar can load rooms."
    );
  }

  // Fetch from both sources in parallel
  const [subscribedRooms, discoveredRooms] = await Promise.all([
    listVisibleCalendarRooms(auth),
    discoverRoomsFromEvents(auth),
  ]);

  // Merge: subscribed rooms take priority (they have better metadata)
  const roomMap = new Map<string, CalendarRoom>();
  for (const room of discoveredRooms) roomMap.set(room.id, room);
  for (const room of subscribedRooms) roomMap.set(room.id, room);

  const rooms = Array.from(roomMap.values()).sort((a, b) =>
    a.summary.localeCompare(b.summary)
  );

  return { status: "ok", rooms };
}
