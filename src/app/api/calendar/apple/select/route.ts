import { NextRequest, NextResponse } from "next/server";
import { readAppleRaw, writeAppleRaw, deleteAppleRaw } from "@/lib/db";
import { auth } from "@/auth";
import {
  encryptJson,
  decryptJson,
  AppleCredentials,
} from "@/lib/crypto";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawCookie = await readAppleRaw(session.user.email);
  if (!rawCookie) {
    return NextResponse.json(
      { error: "No Apple Calendar account connected." },
      { status: 400 }
    );
  }

  const credentials = decryptJson<AppleCredentials>(rawCookie);
  if (!credentials) {
    return NextResponse.json(
      { error: "Invalid Apple Calendar session. Please reconnect." },
      { status: 400 }
    );
  }

  if (credentials.type !== "caldav") {
    return NextResponse.json(
      { error: "Calendar selection is only supported for iCloud CalDAV accounts." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { selectedCalendarUrls } = body;

    if (!Array.isArray(selectedCalendarUrls)) {
      return NextResponse.json(
        { error: "selectedCalendarUrls must be an array of strings." },
        { status: 400 }
      );
    }

    credentials.selectedCalendarUrls = selectedCalendarUrls;
    credentials.lastSyncedAt = new Date().toISOString();

    const encrypted = encryptJson(credentials);
    await writeAppleRaw(session.user.email, encrypted);

    return NextResponse.json({
      success: true,
      selectedCalendarUrls: credentials.selectedCalendarUrls,
    });
  } catch (err: any) {
    console.error("Error updating selected Apple calendars:", err);
    return NextResponse.json(
      { error: "Failed to update calendar selection.", details: err?.message },
      { status: 500 }
    );
  }
}
