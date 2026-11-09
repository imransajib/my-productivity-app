import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { extractMeetingInfo, cleanLocation } from "@/lib/meetingLinks";
import { CalendarEvent } from "@/lib/types";
import { getGoogleAccessToken } from "@/lib/googleToken";

export async function GET(request: NextRequest) {
  // Call auth before the try block so Next.js dynamic-rendering bailouts are not swallowed
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized: Please sign in to access calendar events." },
      { status: 401 }
    );
  }

  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      {
        error: "Google authentication token expired. Please reconnect your Google account.",
        reconnectRequired: true,
      },
      { status: 401 }
    );
  }

  // Retrieve access token securely server-side from JWT cookie
  const tokenResult = await getGoogleAccessToken(request);
  if (!tokenResult.accessToken) {
    return NextResponse.json(
      {
        error: tokenResult.error || "No valid Google access token available.",
        reconnectRequired: tokenResult.reconnectRequired ?? true,
      },
      { status: 401 }
    );
  }

  const accessToken = tokenResult.accessToken;

  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const requestedCalendarsParam = searchParams.get("calendars");
    const calendarsOnly = searchParams.get("calendarsOnly") === "true";

    // 1. Fetch user's calendar list from Google Calendar API
    const calendarListRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (calendarListRes.status === 401) {
      return NextResponse.json(
        {
          error: "Google access token has expired or was revoked. Reconnect required.",
          reconnectRequired: true,
        },
        { status: 401 }
      );
    }

    if (!calendarListRes.ok) {
      const errText = await calendarListRes.text();
      console.error("Google CalendarList API error:", calendarListRes.status, errText);
      return NextResponse.json(
        { error: `Google Calendar API error: ${calendarListRes.statusText}` },
        { status: calendarListRes.status }
      );
    }

    const calendarListData = await calendarListRes.json();
    const allCalendars: any[] = calendarListData.items || [];

    const availableCalendars = allCalendars.map((cal) => ({
      id: cal.id,
      summary: cal.summary || "Untitled Calendar",
      primary: Boolean(cal.primary),
      backgroundColor: cal.backgroundColor || "#4285F4",
      selected: Boolean(!cal.hidden && cal.selected !== false),
    }));

    if (calendarsOnly) {
      return NextResponse.json({ calendars: availableCalendars });
    }

    // Filter to selected calendars based on query parameter or defaults
    let selectedCalendars: any[] = [];
    if (requestedCalendarsParam) {
      const requestedIds = requestedCalendarsParam
        .split(",")
        .map((s) => decodeURIComponent(s.trim()))
        .filter(Boolean);
      selectedCalendars = allCalendars.filter((cal) => requestedIds.includes(cal.id));
    }

    if (selectedCalendars.length === 0) {
      selectedCalendars = allCalendars.filter((cal) => !cal.hidden && cal.selected !== false);
    }

    if (selectedCalendars.length === 0 && allCalendars.length > 0) {
      selectedCalendars = allCalendars.slice(0, 1);
    }

    // Standardize timeMin and timeMax as RFC3339 timestamps
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 2, 28).toISOString();

    const timeMin = fromParam && !isNaN(new Date(fromParam).getTime())
      ? new Date(fromParam).toISOString()
      : defaultFrom;

    const timeMax = toParam && !isNaN(new Date(toParam).getTime())
      ? new Date(toParam).toISOString()
      : defaultTo;

    // 2. Fetch events for each selected calendar concurrently
    const eventFetchPromises = selectedCalendars.map(async (cal) => {
      try {
        const eventsUrl = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
        );
        eventsUrl.searchParams.set("singleEvents", "true");
        eventsUrl.searchParams.set("orderBy", "startTime");
        eventsUrl.searchParams.set("timeMin", timeMin);
        eventsUrl.searchParams.set("timeMax", timeMax);
        eventsUrl.searchParams.set("maxResults", "250");

        const eventsRes = await fetch(eventsUrl.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        });

        if (!eventsRes.ok) {
          console.warn(`Failed fetching events for calendar [${cal.id}]: ${eventsRes.statusText}`);
          return [];
        }

        const eventsData = await eventsRes.json();
        return (eventsData.items || []).map((item: any) => ({
          item,
          calendar: cal,
        }));
      } catch (err) {
        console.error(`Error querying events for calendar [${cal.id}]:`, err);
        return [];
      }
    });

    const settledResults = await Promise.all(eventFetchPromises);
    const combinedEventEntries = settledResults.flat();

    // 3. Normalise events into CalendarEvent type
    const normalisedEvents: CalendarEvent[] = [];

    for (const { item, calendar } of combinedEventEntries) {
      // Ignore cancelled instances
      if (item.status === "cancelled") continue;

      const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
      let startTime = item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00` : "");
      let endTime = item.end?.dateTime || "";

      // Fix for all-day Google events:
      // In Google Calendar API, end.date is EXCLUSIVE (e.g., Nov 9 event has end.date = '2026-11-10').
      // Subtract 1 day to set end = end.date minus one day at 23:59:59 so a 1-day event does not span two days.
      if (isAllDay && item.end?.date) {
        const endDateObj = new Date(`${item.end.date}T00:00:00Z`);
        endDateObj.setUTCDate(endDateObj.getUTCDate() - 1);
        const ey = endDateObj.getUTCFullYear();
        const em = String(endDateObj.getUTCMonth() + 1).padStart(2, "0");
        const ed = String(endDateObj.getUTCDate()).padStart(2, "0");
        endTime = `${ey}-${em}-${ed}T23:59:59`;
        if (endTime < startTime) {
          endTime = `${item.start.date}T23:59:59`;
        }
      } else if (!endTime && item.end?.date) {
        endTime = `${item.end.date}T23:59:59`;
      }

      if (!startTime) continue;
      if (!endTime) {
        const startD = new Date(startTime);
        startD.setHours(startD.getHours() + 1);
        endTime = startD.toISOString();
      }

      // Extract meeting link and provider (meet/zoom/teams/webex/other)
      const meetingInfo = extractMeetingInfo({
        hangoutLink: item.hangoutLink,
        conferenceData: item.conferenceData,
        location: item.location,
        description: item.description,
      });

      // Clean physical location (omit if pure virtual meeting URL)
      const cleanedLocation = cleanLocation(item.location, meetingInfo.meetingUrl);

      const calendarEvent: CalendarEvent = {
        id: `google-${item.id}`,
        title: item.summary?.trim() || "(No title)",
        description: item.description || undefined,
        startTime,
        endTime,
        isAllDay,
        allDay: isAllDay,
        location: cleanedLocation,
        meetingUrl: meetingInfo.meetingUrl,
        meetingProvider: meetingInfo.meetingProvider,
        source: "google",
        calendarName: calendar.summary || "Google Calendar",
        color: calendar.backgroundColor || undefined,
        updatedAt: item.updated || new Date().toISOString(),
      };

      normalisedEvents.push(calendarEvent);
    }

    // Sort chronologically by start time
    normalisedEvents.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return NextResponse.json({
      calendars: availableCalendars,
      events: normalisedEvents,
    });
  } catch (error: any) {
    console.error("Unhandled exception in /api/calendar/google:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
