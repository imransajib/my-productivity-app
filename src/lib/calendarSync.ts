import { CalendarEvent } from "./types";
import { parseIcsEvents } from "./icalParser";

export interface FetchGoogleCalendarOptions {
  from?: string; // ISO string
  to?: string;   // ISO string
  calendarIds?: string[];
}

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  selected?: boolean;
}

export interface GoogleCalendarSyncResult {
  events: CalendarEvent[];
  calendars?: GoogleCalendarItem[];
  error?: string;
  reconnectRequired?: boolean;
}

export interface AppleCalendarItem {
  url: string;
  name: string;
  color?: string;
}

export interface AppleCalendarSyncResult {
  events: CalendarEvent[];
  connected: boolean;
  method?: "caldav" | "ics";
  email?: string;
  url?: string;
  name?: string;
  calendars?: AppleCalendarItem[];
  selectedCalendarUrls?: string[];
  error?: string;
  reconnectRequired?: boolean;
}

export interface FullSyncResult {
  events: CalendarEvent[];
  google: GoogleCalendarSyncResult;
  apple: AppleCalendarSyncResult;
  syncedAt: string;
}

/**
 * Fetches real Google Calendar events from `/api/calendar/google`.
 */
export async function fetchGoogleCalendarEvents(
  options: FetchGoogleCalendarOptions = {}
): Promise<GoogleCalendarSyncResult> {
  try {
    const params = new URLSearchParams();
    if (options.from) params.set("from", options.from);
    if (options.to) params.set("to", options.to);
    if (options.calendarIds && options.calendarIds.length > 0) {
      params.set("calendars", options.calendarIds.join(","));
    }

    const qs = params.toString();
    const endpoint = `/api/calendar/google${qs ? `?${qs}` : ""}`;

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        events: [],
        calendars: data.calendars || [],
        error: data.error || `Google Calendar sync failed (${res.status})`,
        reconnectRequired: Boolean(data.reconnectRequired || res.status === 401),
      };
    }

    const events: CalendarEvent[] = Array.isArray(data.events)
      ? data.events
      : Array.isArray(data)
      ? data
      : [];

    return {
      events,
      calendars: data.calendars || [],
      reconnectRequired: false,
    };
  } catch (err: any) {
    console.error("Error fetching Google Calendar events:", err);
    return {
      events: [],
      error: err?.message || "Network error connecting to Google Calendar sync route",
    };
  }
}

/**
 * Fetches Apple Calendar events from `/api/calendar/apple`.
 */
export async function fetchAppleCalendarEvents(
  options: { from?: string; to?: string } = {}
): Promise<AppleCalendarSyncResult> {
  try {
    const params = new URLSearchParams();
    if (options.from) params.set("from", options.from);
    if (options.to) params.set("to", options.to);

    const qs = params.toString();
    const endpoint = `/api/calendar/apple${qs ? `?${qs}` : ""}`;

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        events: [],
        connected: Boolean(data.connected),
        error: data.error || `Apple Calendar sync failed (${res.status})`,
        reconnectRequired: Boolean(data.reconnectRequired),
      };
    }

    return {
      events: Array.isArray(data.events) ? data.events : [],
      connected: Boolean(data.connected),
      method: data.method,
      email: data.email,
      url: data.url,
      name: data.name,
      calendars: data.calendars || [],
      selectedCalendarUrls: data.selectedCalendarUrls || [],
      error: data.error,
      reconnectRequired: Boolean(data.reconnectRequired),
    };
  } catch (err: any) {
    console.error("Error fetching Apple Calendar events:", err);
    return {
      events: [],
      connected: false,
      error: err?.message || "Network error connecting to Apple Calendar sync route",
    };
  }
}

/**
 * Connect to Apple Calendar using either iCloud CalDAV or Public/shared ICS link.
 */
export async function connectAppleCalendar(params: {
  method: "caldav" | "ics";
  email?: string;
  password?: string;
  url?: string;
}): Promise<{
  success: boolean;
  method?: "caldav" | "ics";
  calendars?: AppleCalendarItem[];
  selectedCalendarUrls?: string[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/calendar/apple/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || `Failed to connect (${res.status})`,
      };
    }

    return {
      success: true,
      method: data.method,
      calendars: data.calendars || [],
      selectedCalendarUrls: data.selectedCalendarUrls || [],
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Network error connecting to Apple Calendar",
    };
  }
}

/**
 * Update selected iCloud CalDAV calendars to sync.
 */
export async function selectAppleCalendars(
  selectedCalendarUrls: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/calendar/apple/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ selectedCalendarUrls }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || "Failed to save selection" };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/**
 * Disconnects Apple Calendar connection and clears credentials cookie.
 */
export async function disconnectAppleCalendar(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const res = await fetch("/api/calendar/apple", {
      method: "DELETE",
    });

    const data = await res.json();
    return { success: res.ok };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Normalizes start time representation to comparable ISO minutes (YYYY-MM-DDTHH:mm).
 */
function normalizeTimeKey(iso: string): string {
  if (!iso) return "0000-00-00T00:00";
  // If date-only format YYYY-MM-DD
  if (iso.length === 10) return `${iso}T00:00`;
  return iso.substring(0, 16);
}

/**
 * De-duplicates calendar events matching same title + start time.
 * If duplicate exists across feeds (e.g. Google and Apple both have the event),
 * retains the richer instance (e.g. having meeting links, description or location).
 */
export function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const map = new Map<string, CalendarEvent>();

  for (const event of events) {
    const cleanTitle = (event.title || "").trim().toLowerCase();
    const timeKey = normalizeTimeKey(event.startTime);
    const dedupeKey = `${cleanTitle}___${timeKey}`;

    const existing = map.get(dedupeKey);
    if (!existing) {
      map.set(dedupeKey, event);
    } else {
      // Prioritize entry with video meeting link, then with description
      const existingWeight = (existing.meetingUrl ? 2 : 0) + (existing.description ? 1 : 0);
      const newWeight = (event.meetingUrl ? 2 : 0) + (event.description ? 1 : 0);

      if (newWeight > existingWeight) {
        map.set(dedupeKey, event);
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

/**
 * Synchronizes all active calendar feeds (Google + Apple) in parallel,
 * merges and de-duplicates all events.
 */
export async function syncAllCalendars(options: {
  from?: string;
  to?: string;
  googleCalendarIds?: string[];
  localEvents?: CalendarEvent[];
} = {}): Promise<FullSyncResult> {
  const [googleRes, appleRes] = await Promise.allSettled([
    fetchGoogleCalendarEvents({
      from: options.from,
      to: options.to,
      calendarIds: options.googleCalendarIds,
    }),
    fetchAppleCalendarEvents({
      from: options.from,
      to: options.to,
    }),
  ]);

  const google: GoogleCalendarSyncResult =
    googleRes.status === "fulfilled"
      ? googleRes.value
      : { events: [], error: "Google Calendar sync failed" };

  const apple: AppleCalendarSyncResult =
    appleRes.status === "fulfilled"
      ? appleRes.value
      : { events: [], connected: false, error: "Apple Calendar sync failed" };

  const local = options.localEvents || [];
  const merged = [...local, ...google.events, ...apple.events];
  const deduplicated = deduplicateEvents(merged);

  return {
    events: deduplicated,
    google,
    apple,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Backward compatible parseICS helper powered by RFC-compliant ical.js.
 */
export function parseICS(
  icsContent: string,
  calendarName: string = "Apple Calendar"
): CalendarEvent[] {
  return parseIcsEvents({
    icsContent,
    calendarName,
    calendarColor: "#007AFF",
  });
}
