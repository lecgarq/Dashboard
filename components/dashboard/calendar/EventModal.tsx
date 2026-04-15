"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { startOAuthConnect } from "@/lib/oauth-connect";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  AlignLeft,
  Building2,
  CalendarIcon,
  Check,
  DoorOpen,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  description: string | null;
  location: string | null;
  meetLink: string | null;
  attendees: {
    email: string;
    displayName?: string | null;
    responseStatus?: string | null;
    resource?: boolean;
  }[];
  organizer: { email: string; displayName?: string | null; self?: boolean } | null;
  status: string | null;
  htmlLink: string | null;
  color: string | null;
}

interface GuestPerson {
  resourceName: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  costCenter: string | null;
}

interface GuestDirectoryResult {
  status: "ok" | "not_linked" | "reconnect_required";
  people: GuestPerson[];
  departments: string[];
  costCenters: string[];
  message?: string;
}

interface CalendarRoomOption {
  id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  capacity?: number | null;
  buildingId?: string | null;
  floorName?: string | null;
  userVisibleDescription?: string | null;
}

interface RoomLookupResult {
  status: "ok" | "not_linked" | "reconnect_required";
  rooms: CalendarRoomOption[];
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event?: CalendarEvent | null;
  defaultDate?: Date;
  onSuccess?: () => void;
}

const EMPTY_GUEST_DIRECTORY: GuestDirectoryResult = {
  status: "not_linked",
  people: [],
  departments: [],
  costCenters: [],
};

const EMPTY_ROOM_LOOKUP: RoomLookupResult = {
  status: "not_linked",
  rooms: [],
};

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toDateValue(iso: string) {
  return iso.split("T")[0];
}

function localToIso(local: string) {
  return new Date(local).toISOString();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function GuestAvatar({
  displayName,
  photoUrl,
  size = "sm",
}: {
  displayName: string;
  photoUrl: string | null;
  size?: "sm" | "xs";
}) {
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const dimensions = size === "xs" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={displayName}
        referrerPolicy="no-referrer"
        className={cn("rounded-full object-cover ring-1 ring-border", dimensions)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br from-primary to-chart-4 text-white font-semibold flex items-center justify-center ring-1 ring-primary/20",
        dimensions
      )}
    >
      {initials || "?"}
    </div>
  );
}

function Notice({
  tone = "warning",
  message,
  actionLabel,
  onAction,
}: {
  tone?: "warning" | "error";
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (!message) return null;

  const toneClasses =
    tone === "error"
      ? "border-destructive/20 bg-destructive/5 text-destructive"
      : "border-amber-500/20 bg-amber-500/5 text-amber-400";

  return (
    <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs", toneClasses)}>
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="flex-1">{message}</p>
        {actionLabel && onAction ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 self-start"
            onClick={onAction}
          >
            <Link2 size={12} />
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EventModal({ open, onOpenChange, event, defaultDate, onSuccess }: Props) {
  const utils = trpc.useUtils();
  const isEdit = !!event;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [addMeetLink, setAddMeetLink] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<CalendarRoomOption | null>(null);
  const [roomSearch, setRoomSearch] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [selectedGuests, setSelectedGuests] = useState<GuestPerson[]>([]);
  const [activeDepartment, setActiveDepartment] = useState("");
  const [activeCostCenter, setActiveCostCenter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deferredGuestSearch = useDeferredValue(guestSearch.trim().toLowerCase());
  const deferredRoomSearch = useDeferredValue(roomSearch.trim().toLowerCase());

  const { data: guestDirectory = EMPTY_GUEST_DIRECTORY } = trpc.calendar.getGuestDirectory.useQuery(
    undefined,
    {
      staleTime: 300_000,
      enabled: open,
    }
  );

  const { data: roomLookup = EMPTY_ROOM_LOOKUP } = trpc.calendar.listRooms.useQuery(undefined, {
    staleTime: 300_000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;

    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
      setAllDay(event.allDay);
      setStart(event.allDay ? toDateValue(event.start) : toLocalDatetimeValue(event.start));
      setEnd(
        event.end ? (event.allDay ? toDateValue(event.end) : toLocalDatetimeValue(event.end)) : ""
      );
      setAddMeetLink(!!event.meetLink);
      setSelectedGuests(
        event.attendees
          .filter((attendee) => !attendee.resource)
          .map((attendee) => ({
            resourceName: attendee.email,
            displayName: attendee.displayName ?? attendee.email,
            email: attendee.email,
            photoUrl: null,
            department: null,
            jobTitle: null,
            phoneNumber: null,
            costCenter: null,
          }))
      );

      const roomAttendee = event.attendees.find((attendee) => attendee.resource);
      setSelectedRoom(
        roomAttendee
          ? {
              id: roomAttendee.email,
              summary: roomAttendee.displayName ?? roomAttendee.email,
              description: null,
              location: null,
              capacity: null,
              buildingId: null,
              floorName: null,
              userVisibleDescription: null,
            }
          : null
      );
    } else {
      setTitle("");
      setDescription("");
      setLocation("");
      setAllDay(false);
      const base = defaultDate ?? new Date();
      const padded = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${base.getFullYear()}-${padded(base.getMonth() + 1)}-${padded(
        base.getDate()
      )}`;
      setStart(`${dateStr}T09:00`);
      setEnd(`${dateStr}T10:00`);
      setAddMeetLink(false);
      setSelectedRoom(null);
      setSelectedGuests([]);
    }

    setRoomSearch("");
    setGuestSearch("");
    setActiveDepartment("");
    setActiveCostCenter("");
    setConfirmDelete(false);
  }, [open, event, defaultDate]);

  useEffect(() => {
    if (!selectedRoom) return;
    const matchedRoom = roomLookup.rooms.find((room) => room.id === selectedRoom.id);
    if (matchedRoom) {
      setSelectedRoom((currentRoom) => {
        if (!currentRoom || currentRoom.id !== matchedRoom.id) return currentRoom;
        return matchedRoom;
      });
    }
  }, [roomLookup.rooms, selectedRoom]);

  const createEvent = trpc.calendar.createEvent.useMutation({
    onSuccess: () => {
      utils.calendar.getEvents.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
  });

  const updateEvent = trpc.calendar.updateEvent.useMutation({
    onSuccess: () => {
      utils.calendar.getEvents.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
  });

  const deleteEvent = trpc.calendar.deleteEvent.useMutation({
    onSuccess: () => {
      utils.calendar.getEvents.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
  });

  const isPending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const filteredGuests = useMemo(() => {
    const selectedEmails = new Set(selectedGuests.map((guest) => guest.email.toLowerCase()));

    return guestDirectory.people
      .filter((person) => !selectedEmails.has(person.email.toLowerCase()))
      .filter((person) => {
        if (activeDepartment && person.department !== activeDepartment) return false;
        if (activeCostCenter && person.costCenter !== activeCostCenter) return false;

        if (!deferredGuestSearch) return true;

        const searchableText = [
          person.displayName,
          person.email,
          person.department,
          person.jobTitle,
          person.costCenter,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(deferredGuestSearch);
      })
      .slice(0, 12);
  }, [
    activeCostCenter,
    activeDepartment,
    deferredGuestSearch,
    guestDirectory.people,
    selectedGuests,
  ]);

  const filteredRooms = useMemo(() => {
    return roomLookup.rooms
      .filter((room) => {
        if (!deferredRoomSearch) return true;
        const searchableText = [
          room.summary,
          room.location,
          room.description,
          room.id,
          room.buildingId,
          room.floorName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchableText.includes(deferredRoomSearch);
      })
      .slice(0, 12);
  }, [deferredRoomSearch, roomLookup.rooms]);

  const canAddExternalGuest =
    isValidEmail(guestSearch) &&
    !selectedGuests.some((guest) => guest.email.toLowerCase() === guestSearch.trim().toLowerCase());

  const addGuest = (guest: GuestPerson) => {
    setSelectedGuests((currentGuests) => {
      if (currentGuests.some((item) => item.email.toLowerCase() === guest.email.toLowerCase())) {
        return currentGuests;
      }
      return [...currentGuests, guest];
    });
    setGuestSearch("");
  };

  const addExternalGuest = () => {
    if (!canAddExternalGuest) return;

    const email = guestSearch.trim().toLowerCase();
    addGuest({
      resourceName: email,
      displayName: email,
      email,
      photoUrl: null,
      department: null,
      jobTitle: null,
      phoneNumber: null,
      costCenter: null,
    });
  };

  const removeGuest = (email: string) => {
    setSelectedGuests((currentGuests) =>
      currentGuests.filter((guest) => guest.email.toLowerCase() !== email.toLowerCase())
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) return;

    const startIso = allDay ? start : localToIso(start);
    const endIso = allDay ? end : localToIso(end);
    const attendeeEmails = selectedGuests.map((guest) => guest.email);

    if (isEdit && event) {
      updateEvent.mutate({
        eventId: event.id,
        title: title.trim(),
        description: description || undefined,
        location: location || undefined,
        start: startIso,
        end: endIso,
        allDay,
        addMeetLink,
        roomEmail: selectedRoom?.id || undefined,
        attendeeEmails,
      });
    } else {
      createEvent.mutate({
        title: title.trim(),
        description: description || undefined,
        location: location || undefined,
        start: startIso,
        end: endIso,
        allDay,
        addMeetLink,
        roomEmail: selectedRoom?.id || undefined,
        attendeeEmails,
      });
    }
  };

  const guestNoticeTone = "warning" as const;
  const roomNoticeTone = "warning" as const;
  const reconnectGoogle = () => {
    startOAuthConnect("google", {
      callbackUrl: window.location.href,
      forceConsent: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-primary" />
            {isEdit ? "Edit Event" : "New Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <Input
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-base font-medium border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAllDay((value) => !value)}
              className={cn(
                "text-xs px-2 py-1 rounded-md border transition-colors",
                allDay
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground border-border hover:bg-muted/30"
              )}
            >
              All day
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                Start
              </label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                End
              </label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <AlignLeft size={14} className="mt-2.5 text-muted-foreground shrink-0" />
            <textarea
              placeholder="Add description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="flex-1 bg-transparent text-sm resize-none border-0 border-b border-border focus:outline-none focus:border-primary transition-colors py-1.5 placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-muted-foreground shrink-0" />
            <Input
              placeholder="Add location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent text-sm"
            />
          </div>

          <button
            onClick={() => setAddMeetLink((value) => !value)}
            className={cn(
              "flex items-center gap-2 text-sm px-3 py-2 rounded-lg border w-full text-left transition-colors",
              addMeetLink
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : "border-border text-muted-foreground hover:bg-muted/30"
            )}
          >
            <Video size={14} />
            {addMeetLink ? "Google Meet link will be generated" : "Add Google Meet link"}
            {event?.meetLink && !addMeetLink && (
              <a
                href={event.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-blue-400 hover:text-blue-300"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </button>

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <DoorOpen size={12} />
              Meeting Room
            </label>

            <Notice
              tone={roomNoticeTone}
              message={roomLookup.status === "ok" ? undefined : roomLookup.message}
              actionLabel={roomLookup.status === "reconnect_required" ? "Reconnect Google" : undefined}
              onAction={roomLookup.status === "reconnect_required" ? reconnectGoogle : undefined}
            />

            {selectedRoom && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{selectedRoom.summary}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedRoom.id}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {selectedRoom.location && <span>{selectedRoom.location}</span>}
                    {selectedRoom.capacity ? <span>{selectedRoom.capacity} seats</span> : null}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedRoom(null)}
                >
                  <X size={14} />
                </Button>
              </div>
            )}

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search all Workspace rooms"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="max-h-52 overflow-y-auto divide-y divide-border">
                {filteredRooms.map((room) => {
                  const isSelected = selectedRoom?.id === room.id;
                  return (
                    <button
                      key={room.id}
                      onClick={() => {
                        setSelectedRoom(room);
                        setRoomSearch("");
                      }}
                      className={cn(
                        "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-muted/40"
                      )}
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Building2 size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{room.summary}</p>
                          {isSelected && <Check size={13} className="text-primary shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{room.id}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {room.location && <span>{room.location}</span>}
                          {room.capacity ? <span>{room.capacity} seats</span> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredRooms.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {roomLookup.rooms.length === 0
                      ? "No rooms available."
                      : `No rooms match "${roomSearch.trim()}".`}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Users size={12} />
              Guests
            </label>

            <Notice
              tone={guestNoticeTone}
              message={guestDirectory.status === "ok" ? undefined : guestDirectory.message}
              actionLabel={guestDirectory.status === "reconnect_required" ? "Reconnect Google" : undefined}
              onAction={guestDirectory.status === "reconnect_required" ? reconnectGoogle : undefined}
            />

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search people or type an external email"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAddExternalGuest) {
                    e.preventDefault();
                    addExternalGuest();
                  }
                }}
                className="pl-8 text-sm"
              />
            </div>

            {(guestDirectory.departments.length > 0 || guestDirectory.costCenters.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={activeDepartment}
                  onChange={(e) => setActiveDepartment(e.target.value)}
                  className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All departments</option>
                  {guestDirectory.departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
                <select
                  value={activeCostCenter}
                  onChange={(e) => setActiveCostCenter(e.target.value)}
                  className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All cost centers</option>
                  {guestDirectory.costCenters.map((costCenter) => (
                    <option key={costCenter} value={costCenter}>
                      {costCenter}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedGuests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedGuests.map((guest) => (
                  <span
                    key={guest.email}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-2.5 py-1.5 max-w-full"
                  >
                    <GuestAvatar displayName={guest.displayName} photoUrl={guest.photoUrl} size="xs" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground truncate max-w-[180px]">
                        {guest.displayName}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate max-w-[180px]">
                        {guest.email}
                      </span>
                    </span>
                    <button
                      onClick={() => removeGuest(guest.email)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {canAddExternalGuest && (
                  <button
                    onClick={addExternalGuest}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Invite external guest
                      </p>
                      <p className="text-[11px] text-muted-foreground">{guestSearch.trim().toLowerCase()}</p>
                    </div>
                    <span className="text-[11px] text-primary font-medium">Add email</span>
                  </button>
                )}

                {filteredGuests.map((person) => (
                  <button
                    key={person.resourceName}
                    onClick={() => addGuest(person)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <GuestAvatar displayName={person.displayName} photoUrl={person.photoUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{person.displayName}</p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{person.email}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {person.department && <span>{person.department}</span>}
                        {person.jobTitle && <span>{person.jobTitle}</span>}
                        {person.costCenter && <span>CC: {person.costCenter}</span>}
                      </div>
                    </div>
                  </button>
                ))}

                {filteredGuests.length === 0 && !canAddExternalGuest && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {guestDirectory.people.length === 0
                      ? "No directory guests available. You can still type an external email."
                      : `No guests match "${guestSearch.trim()}".`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {isEdit && event && event.attendees.length > 0 && (
            <div className="pt-1 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Current Responses
              </p>
              <div className="space-y-1">
                {event.attendees.map((attendee) => (
                  <div key={attendee.email} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        attendee.responseStatus === "accepted"
                          ? "bg-green-400"
                          : attendee.responseStatus === "declined"
                            ? "bg-red-400"
                            : "bg-muted-foreground/40"
                      )}
                    />
                    <span className={attendee.resource ? "text-blue-400" : ""}>
                      {attendee.displayName ?? attendee.email}
                      {attendee.resource && " (Room)"}
                    </span>
                    <span className="text-muted-foreground/40">{attendee.responseStatus}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(createEvent.error || updateEvent.error || deleteEvent.error) && (
            <p className="text-xs text-destructive">
              {createEvent.error?.message || updateEvent.error?.message || deleteEvent.error?.message}
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            {isEdit ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Delete this event?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => deleteEvent.mutate({ eventId: event!.id })}
                  >
                    {deleteEvent.isPending ? <Loader2 size={12} className="animate-spin" /> : "Confirm"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={13} className="mr-1" />
                  Delete
                </Button>
              )
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isPending || !title.trim()}
                onClick={handleSubmit}
                className="gap-1.5"
              >
                {isPending && <Loader2 size={12} className="animate-spin" />}
                {isEdit ? "Save changes" : "Create event"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
