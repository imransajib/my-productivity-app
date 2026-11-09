import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { createDAVClient } from "tsdav";
import {
  decryptJson,
  APPLE_COOKIE_NAME,
  AppleCredentials,
} from "@/lib/crypto";
import { parseIcsEvents } from "@/lib/icalParser";
import { CalendarEvent } from "@/lib/types";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(APPLE_COOKIE_NAME)?.value;
  if (!rawCookie) {
    return NextResponse.json({
      connected: false,
      events: [],
    });
  }

  const credentials = decryptJson<AppleCredentials>(rawCookie);
  if (!credentials) {
    return NextResponse.json({
      connected: false,
      events: [],
      error: "Apple credentials session expired or corrupted. Please reconnect.",
    });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 2, 28).toISOString();

  const from = fromParam && !isNaN(new Date(fromParam).getTime()) ? fromParam : defaultFrom;
  const to = toParam && !isNaN(new Date(toParam).getTime()) ? toParam : defaultTo;

  if (credentials.type === "caldav") {
    try {
      const client = await createDAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: {
          username: credentials.email,
          password: credentials.password,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });

      const allCalendars = await client.fetchCalendars();
      const selectedUrls =
        credentials.selectedCalendarUrls && credentials.selectedCalendarUrls.length > 0
          ? credentials.selectedCalendarUrls
          : allCalendars.map((c) => c.url);

      const targetCalendars = allCalendars.filter((c) => selectedUrls.includes(c.url));

      const allEvents: CalendarEvent[] = [];

      for (const cal of targetCalendars) {
        let calName = "Apple Calendar";
        if (typeof cal.displayName === "string") {
          calName = cal.displayName;
        } else if (cal.displayName && typeof cal.displayName === "object") {
          calName =
            (cal.displayName as any)._text ||
            (cal.displayName as any).displayName ||
            "Apple Calendar";
        }
        const calColor = cal.calendarColor || "#007AFF";

        try {
          const objects = await client.fetchCalendarObjects({
            calendar: cal,
            timeRange: {
              start: from,
              end: to,
            },
          });

          for (const obj of objects) {
            if (!obj.data || typeof obj.data !== "string") continue;
            const parsed = parseIcsEvents({
              icsContent: obj.data,
              calendarName: calName,
              calendarColor: calColor,
              from,
              to,
            });
            allEvents.push(...parsed);
          }
        } catch (calErr) {
          console.error(`Error querying calendar objects for [${cal.url}]:`, calErr);
        }
      }

      // Sort chronologically
      allEvents.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      return NextResponse.json({
        connected: true,
        method: "caldav",
        email: credentials.email,
        calendars: credentials.calendars || targetCalendars.map((c) => ({
          url: c.url,
          name: typeof c.displayName === "string" ? c.displayName : "Calendar",
          color: c.calendarColor,
        })),
        selectedCalendarUrls: selectedUrls,
        events: allEvents,
      });
    } catch (calDavErr: any) {
      console.error("CalDAV sync error:", calDavErr);
      return NextResponse.json({
        connected: true,
        method: "caldav",
        error: "Failed to sync Apple CalDAV events. Your app-specific password may have been revoked.",
        reconnectRequired: true,
        events: [],
      });
    }
  }

  if (credentials.type === "ics") {
    try {
      const response = await fetch(credentials.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
          Accept: "text/calendar, text/plain, */*",
        },
      });

      if (!response.ok) {
        return NextResponse.json({
          connected: true,
          method: "ics",
          error: `Failed to fetch public calendar feed (${response.status} ${response.statusText})`,
          events: [],
        });
      }

      const icsText = await response.text();
      const events = parseIcsEvents({
        icsContent: icsText,
        calendarName: credentials.name || "Apple Shared Calendar",
        calendarColor: credentials.color || "#007AFF",
        from,
        to,
      });

      events.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      return NextResponse.json({
        connected: true,
        method: "ics",
        url: credentials.url,
        name: credentials.name,
        calendars: [
          {
            url: credentials.url,
            name: credentials.name || "Apple Shared Calendar",
            color: credentials.color || "#007AFF",
          },
        ],
        selectedCalendarUrls: [credentials.url],
        events,
      });
    } catch (icsErr: any) {
      console.error("Shared ICS fetch error:", icsErr);
      return NextResponse.json({
        connected: true,
        method: "ics",
        error: "Failed to fetch shared ICS feed.",
        details: icsErr?.message,
        events: [],
      });
    }
  }

  return NextResponse.json({ connected: false, events: [] });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(APPLE_COOKIE_NAME);

  return NextResponse.json({
    success: true,
    disconnected: true,
  });
}
