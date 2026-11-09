import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { extractMeetingInfo, cleanLocation } from "@/lib/meetingLinks";
import { CalendarEvent } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
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

    const accessToken = session.accessToken;
    if (!accessToken) {
      return NextResponse.json(
        {
          error: "No Google access token found in session. Please sign in again.",
          reconnectRequired: true,
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // Standardize timeMin and timeMax as RFC3339 timestamps
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

    const timeMin = fromParam && !isNaN(new Date(fromParam).getTime())
      ? new Date(fromParam).toISOString()
      : defaultFrom;

    const timeMax = toParam && !isNaN(new Date(toParam).getTime())
      ? new Date(toParam).toISOString()
      : defaultTo;

    // 1. Fetch user's calendar list
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

    // Filter to selected, non-hidden calendars
    let selectedCalendars = allCalendars.filter((cal) => !cal.hidden && cal.selected !== false);
    if (selectedCalendars.length === 0 && allCalendars.length > 0) {
      selectedCalendars = allCalendars.slice(0, 1);
    }

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
      let endTime = item.end?.dateTime || (item.end?.date ? `${item.end.date}T23:59:59` : "");

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

    return NextResponse.json({ events: normalisedEvents });
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
