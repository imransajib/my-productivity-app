import { CalendarEvent } from './types';
import { extractMeetingInfo, cleanLocation } from './meetingLinks';

function parseIcsDate(val: string): { iso: string; isAllDay: boolean } {
  // Format: 20251115T150000Z or 20251115T150000 or 20251115
  const clean = val.replace(/[^0-9TZ]/g, '');
  if (clean.length === 8) {
    // All day date YYYYMMDD
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, isAllDay: true };
  }

  if (clean.includes('T')) {
    const [datePart, timePart] = clean.split('T');
    const y = datePart.substring(0, 4);
    const m = datePart.substring(4, 6);
    const d = datePart.substring(6, 8);
    const hh = timePart.substring(0, 2) || '00';
    const mm = timePart.substring(2, 4) || '00';
    const ss = timePart.substring(4, 6) || '00';
    return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}`, isAllDay: false };
  }

  return { iso: new Date().toISOString(), isAllDay: false };
}

export function parseICS(icsContent: string, calendarName: string = 'Apple Calendar'): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icsContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Unfold ICS lines
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.trim();
    } else {
      unfolded.push(line);
    }
  }

  let currentEvent: Partial<CalendarEvent> | null = null;
  let eventIdx = 1;

  for (const line of unfolded) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      currentEvent = {
        id: `ics-event-${Date.now()}-${eventIdx++}`,
        source: 'apple',
        calendarName,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }

    if (trimmed === 'END:VEVENT' && currentEvent) {
      if (currentEvent.title && currentEvent.startTime) {
        if (!currentEvent.endTime) {
          // Default to 1 hour after start
          const startD = new Date(currentEvent.startTime);
          startD.setHours(startD.getHours() + 1);
          currentEvent.endTime = startD.toISOString().split('.')[0];
        }

        // Apply meeting link and location extraction
        const meetingInfo = extractMeetingInfo({
          location: currentEvent.location,
          description: currentEvent.description,
          url: currentEvent.meetingUrl,
        });

        if (meetingInfo.meetingUrl) {
          currentEvent.meetingUrl = meetingInfo.meetingUrl;
          currentEvent.meetingProvider = meetingInfo.meetingProvider;
        }

        currentEvent.location = cleanLocation(currentEvent.location, currentEvent.meetingUrl);

        events.push(currentEvent as CalendarEvent);
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const propRaw = trimmed.substring(0, colonIdx);
    const value = trimmed.substring(colonIdx + 1).replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    const propName = propRaw.split(';')[0].toUpperCase();

    switch (propName) {
      case 'SUMMARY':
        currentEvent.title = value;
        break;
      case 'DESCRIPTION':
        currentEvent.description = value;
        break;
      case 'LOCATION':
        currentEvent.location = value;
        break;
      case 'URL':
        currentEvent.meetingUrl = value;
        break;
      case 'DTSTART': {
        const parsed = parseIcsDate(value);
        currentEvent.startTime = parsed.iso;
        currentEvent.isAllDay = parsed.isAllDay;
        currentEvent.allDay = parsed.isAllDay;
        break;
      }
      case 'DTEND': {
        const parsed = parseIcsDate(value);
        currentEvent.endTime = parsed.iso;
        break;
      }
    }
  }

  return events;
}

export interface FetchGoogleCalendarOptions {
  from?: string; // ISO string
  to?: string;   // ISO string
}

export interface GoogleCalendarSyncResult {
  events: CalendarEvent[];
  error?: string;
  reconnectRequired?: boolean;
}

/**
 * Fetches real Google Calendar events from the server route /api/calendar/google.
 * Replaces previous mock sync with actual OAuth-authenticated Google Calendar API sync.
 */
export async function fetchGoogleCalendarEvents(
  options: FetchGoogleCalendarOptions = {}
): Promise<GoogleCalendarSyncResult> {
  try {
    const params = new URLSearchParams();
    if (options.from) params.set('from', options.from);
    if (options.to) params.set('to', options.to);

    const qs = params.toString();
    const endpoint = `/api/calendar/google${qs ? `?${qs}` : ''}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        events: [],
        error: data.error || `Google Calendar sync failed (${res.status})`,
        reconnectRequired: Boolean(data.reconnectRequired || res.status === 401),
      };
    }

    const events: CalendarEvent[] = Array.isArray(data.events)
      ? data.events
      : Array.isArray(data)
      ? data
      : [];

    return { events };
  } catch (err: any) {
    console.error('Error fetching Google Calendar events:', err);
    return {
      events: [],
      error: err?.message || 'Network error connecting to Google Calendar sync route',
    };
  }
}
