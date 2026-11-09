import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { createDAVClient } from "tsdav";
import {
  encryptJson,
  decryptJson,
  getAppleCookieOptions,
  APPLE_COOKIE_NAME,
  AppleCredentials,
  AppleCalDavCredentials,
  AppleIcsCredentials,
  AppleCalendarInfo,
} from "@/lib/crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(APPLE_COOKIE_NAME)?.value;
  if (!rawCookie) {
    return NextResponse.json({ connected: false });
  }

  const creds = decryptJson<AppleCredentials>(rawCookie);
  if (!creds) {
    return NextResponse.json({ connected: false });
  }

  if (creds.type === "caldav") {
    return NextResponse.json({
      connected: true,
      method: "caldav",
      email: creds.email,
      calendars: creds.calendars || [],
      selectedCalendarUrls: creds.selectedCalendarUrls || [],
      lastSyncedAt: creds.lastSyncedAt,
    });
  }

  return NextResponse.json({
    connected: true,
    method: "ics",
    url: creds.url,
    name: creds.name || "Apple Shared Calendar",
    calendars: [{ url: creds.url, name: creds.name || "Apple Shared Calendar", color: creds.color || "#007AFF" }],
    selectedCalendarUrls: [creds.url],
    lastSyncedAt: creds.lastSyncedAt,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { method, email, password, url } = body;

    if (method === "caldav") {
      if (!email || !password) {
        return NextResponse.json(
          { error: "Apple ID email and app-specific password are required." },
          { status: 400 }
        );
      }

      const cleanEmail = String(email).trim();
      const cleanPassword = String(password).trim();

      // Connect server-side using tsdav createDAVClient
      let client;
      try {
        client = await createDAVClient({
          serverUrl: "https://caldav.icloud.com",
          credentials: {
            username: cleanEmail,
            password: cleanPassword,
          },
          authMethod: "Basic",
          defaultAccountType: "caldav",
        });
      } catch (clientErr: any) {
        console.error("Failed to initialize CalDAV client:", clientErr);
        return NextResponse.json(
          {
            error: "Unable to authenticate with iCloud CalDAV. Please verify your Apple ID and app-specific password.",
            details: clientErr?.message || String(clientErr),
          },
          { status: 401 }
        );
      }

      let rawCalendars;
      try {
        rawCalendars = await client.fetchCalendars();
      } catch (calErr: any) {
        console.error("Failed to fetch CalDAV calendars:", calErr);
        return NextResponse.json(
          {
            error: "Failed to list calendars from iCloud. Please check your credentials.",
            details: calErr?.message || String(calErr),
          },
          { status: 401 }
        );
      }

      const calendars: AppleCalendarInfo[] = (rawCalendars || []).map((cal) => {
        let name = "Apple Calendar";
        if (typeof cal.displayName === "string") {
          name = cal.displayName;
        } else if (cal.displayName && typeof cal.displayName === "object") {
          name =
            (cal.displayName as any)._text ||
            (cal.displayName as any).displayName ||
            "Apple Calendar";
        }

        return {
          url: cal.url,
          name: name.trim() || "Apple Calendar",
          color: cal.calendarColor || "#007AFF",
        };
      });

      const selectedCalendarUrls = calendars.map((c) => c.url);

      const credentialsData: AppleCalDavCredentials = {
        type: "caldav",
        email: cleanEmail,
        password: cleanPassword,
        calendars,
        selectedCalendarUrls,
        lastSyncedAt: new Date().toISOString(),
      };

      // Store credentials securely in encrypted httpOnly cookie
      const encryptedValue = encryptJson(credentialsData);
      const cookieStore = await cookies();
      cookieStore.set(APPLE_COOKIE_NAME, encryptedValue, getAppleCookieOptions());

      return NextResponse.json({
        success: true,
        method: "caldav",
        email: cleanEmail,
        calendars,
        selectedCalendarUrls,
      });
    }

    if (method === "ics") {
      if (!url) {
        return NextResponse.json(
          { error: "Shared calendar URL is required." },
          { status: 400 }
        );
      }

      // Convert webcal:// to https://
      let icsUrl = String(url).trim();
      if (icsUrl.toLowerCase().startsWith("webcal://")) {
        icsUrl = "https://" + icsUrl.substring(9);
      }

      if (!icsUrl.startsWith("http://") && !icsUrl.startsWith("https://")) {
        return NextResponse.json(
          { error: "Please provide a valid webcal:// or https:// calendar URL." },
          { status: 400 }
        );
      }

      // Validate by fetching server-side
      let icsResponse;
      try {
        icsResponse = await fetch(icsUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
            Accept: "text/calendar, text/plain, */*",
          },
        });
      } catch (fetchErr: any) {
        return NextResponse.json(
          {
            error: "Unable to reach the provided calendar URL. Please verify the link is publicly accessible.",
            details: fetchErr?.message,
          },
          { status: 400 }
        );
      }

      if (!icsResponse.ok) {
        return NextResponse.json(
          {
            error: `Failed to fetch calendar from URL (HTTP ${icsResponse.status} ${icsResponse.statusText})`,
          },
          { status: 400 }
        );
      }

      const icsText = await icsResponse.text();
      if (!icsText.includes("BEGIN:VCALENDAR")) {
        return NextResponse.json(
          { error: "The provided URL did not return valid iCalendar (RFC 5545) data." },
          { status: 400 }
        );
      }

      // Extract calendar display name from X-WR-CALNAME
      let calName = "Apple Shared Calendar";
      const nameMatch = icsText.match(/X-WR-CALNAME:(.+)/i);
      if (nameMatch && nameMatch[1]) {
        calName = nameMatch[1].trim();
      }

      const calendarInfo: AppleCalendarInfo = {
        url: icsUrl,
        name: calName,
        color: "#007AFF",
      };

      const credentialsData: AppleIcsCredentials = {
        type: "ics",
        url: icsUrl,
        name: calName,
        color: "#007AFF",
        lastSyncedAt: new Date().toISOString(),
      };

      const encryptedValue = encryptJson(credentialsData);
      const cookieStore = await cookies();
      cookieStore.set(APPLE_COOKIE_NAME, encryptedValue, getAppleCookieOptions());

      return NextResponse.json({
        success: true,
        method: "ics",
        calendars: [calendarInfo],
        selectedCalendarUrls: [icsUrl],
      });
    }

    return NextResponse.json(
      { error: "Invalid method. Expected 'caldav' or 'ics'." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Unhandled error connecting Apple calendar:", error);
    return NextResponse.json(
      {
        error: "Failed to connect Apple calendar.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
