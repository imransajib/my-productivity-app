import ICAL from "ical.js";
import { CalendarEvent } from "./types";
import { extractMeetingInfo, cleanLocation } from "./meetingLinks";

export interface ParseIcsOptions {
  icsContent: string;
  calendarName?: string;
  calendarColor?: string;
  from?: string; // ISO string e.g. 2026-11-01T00:00:00Z
  to?: string;   // ISO string e.g. 2026-12-31T23:59:59Z
}

/**
 * Format an ICAL.Time instance into an ISO string or YYYY-MM-DDTHH:mm:ss for all-day events.
 */
function formatIcalTime(
  time: ICAL.Time,
  isEnd: boolean = false
): { iso: string; isAllDay: boolean } {
  if (time.isDate) {
    if (isEnd) {
      // In RFC 5545, all-day DTEND is EXCLUSIVE.
      // E.g., for a 1-day event on Nov 9: DTSTART is 20261109, DTEND is 20261110.
      // Subtract 1 day to represent the inclusive end date at 23:59:59.
      const endJs = time.toJSDate();
      endJs.setUTCDate(endJs.getUTCDate() - 1);
      const y = endJs.getUTCFullYear();
      const m = String(endJs.getUTCMonth() + 1).padStart(2, "0");
      const d = String(endJs.getUTCDate()).padStart(2, "0");
      return { iso: `${y}-${m}-${d}T23:59:59`, isAllDay: true };
    }

    const y = time.year;
    const m = String(time.month).padStart(2, "0");
    const d = String(time.day).padStart(2, "0");
    return { iso: `${y}-${m}-${d}T00:00:00`, isAllDay: true };
  }

  // Timed event: convert to standard ISO 8601 UTC string
  try {
    const jsDate = time.toJSDate();
    if (!isNaN(jsDate.getTime())) {
      return { iso: jsDate.toISOString(), isAllDay: false };
    }
  } catch {}

  const y = time.year;
  const m = String(time.month).padStart(2, "0");
  const d = String(time.day).padStart(2, "0");
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  const ss = String(time.second).padStart(2, "0");
  return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}`, isAllDay: false };
}

/**
 * Extracts structured location from Apple extension property:
 * X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE="...":geo:...
 */
function extractAppleStructuredLocation(comp: ICAL.Component): string | undefined {
  try {
    const prop = comp.getFirstProperty("x-apple-structured-location");
    if (!prop) return undefined;

    const title = prop.getParameter("x-title") || prop.getParameter("title");
    if (typeof title === "string" && title.trim()) return title.trim();

    const address = prop.getParameter("x-address") || prop.getParameter("address");
    if (typeof address === "string" && address.trim()) return address.trim();
  } catch {}
  return undefined;
}

/**
 * Parses raw iCalendar string into normalized CalendarEvent models using ical.js.
 * Handles recurring events (RRULE expansion within the requested window), TZID timezones,
 * all-day date bounds, and video meeting detection.
 */
export function parseIcsEvents(options: ParseIcsOptions): CalendarEvent[] {
  const {
    icsContent,
    calendarName = "Apple Calendar",
    calendarColor = "#007AFF",
    from,
    to,
  } = options;

  if (!icsContent || !icsContent.includes("BEGIN:VCALENDAR")) {
    return [];
  }

  const events: CalendarEvent[] = [];

  const now = new Date();
  const fromDate = from && !isNaN(new Date(from).getTime())
    ? new Date(from)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const toDate = to && !isNaN(new Date(to).getTime())
    ? new Date(to)
    : new Date(now.getFullYear(), now.getMonth() + 2, 28);

  const fromTimeMs = fromDate.getTime();
  const toTimeMs = toDate.getTime();

  try {
    const jcalData = ICAL.parse(icsContent);
    const vcalendar = new ICAL.Component(jcalData);

    // Register all VTIMEZONE components
    const vtimezones = vcalendar.getAllSubcomponents("vtimezone");
    for (const vtz of vtimezones) {
      try {
        ICAL.TimezoneService.register(vtz);
      } catch {}
    }

    const vevents = vcalendar.getAllSubcomponents("vevent");

    // Group VEVENTs by UID to associate recurring master events with exception instances
    const eventsByUid = new Map<
      string,
      { master?: ICAL.Component; exceptions: ICAL.Component[] }
    >();

    for (const vevent of vevents) {
      const uid = (vevent.getFirstPropertyValue("uid") as string) || `anon-${Math.random()}`;
      let group = eventsByUid.get(uid);
      if (!group) {
        group = { exceptions: [] };
        eventsByUid.set(uid, group);
      }

      if (vevent.hasProperty("recurrence-id")) {
        group.exceptions.push(vevent);
      } else {
        group.master = vevent;
      }
    }

    // Process each event group
    for (const [uid, { master, exceptions }] of eventsByUid.entries()) {
      if (master) {
        let icalEvent: ICAL.Event;
        try {
          icalEvent = new ICAL.Event(master);
          for (const exc of exceptions) {
            try {
              icalEvent.relateException(exc);
            } catch {}
          }
        } catch (e) {
          console.warn(`Error constructing ICAL.Event for UID ${uid}:`, e);
          continue;
        }

        if (icalEvent.isRecurring()) {
          // Expand recurring instances within the requested date window
          try {
            const iterator = icalEvent.iterator();
            let nextOccTime: ICAL.Time | null = null;
            let iterationCount = 0;
            const MAX_ITERATIONS = 400; // Safeguard against infinite recurrence loops

            while ((nextOccTime = iterator.next()) && iterationCount < MAX_ITERATIONS) {
              iterationCount++;

              const details = icalEvent.getOccurrenceDetails(nextOccTime);
              const occStart = details.startDate;
              const occEnd = details.endDate;
              const occItem = details.item || icalEvent;
              const occComp = occItem.component || master;

              const occStartJs = occStart.toJSDate();
              const occStartMs = occStartJs.getTime();

              // If recurrence start is beyond target range, break early (for ordered rules)
              if (occStartMs > toTimeMs) {
                break;
              }

              const occEndJs = occEnd
                ? occEnd.toJSDate()
                : new Date(occStartMs + 3600000);
              const occEndMs = occEndJs.getTime();

              // Check if occurrence overlaps [fromDate, toDate]
              if (occEndMs < fromTimeMs) {
                continue;
              }

              const formattedStart = formatIcalTime(occStart, false);
              const formattedEnd = occEnd
                ? formatIcalTime(occEnd, true)
                : {
                    iso: formattedStart.isAllDay
                      ? formattedStart.iso.split("T")[0] + "T23:59:59"
                      : new Date(occStartMs + 3600000).toISOString(),
                    isAllDay: formattedStart.isAllDay,
                  };

              // Ensure end is not before start for all-day events
              let finalEndTime = formattedEnd.iso;
              if (formattedStart.isAllDay && finalEndTime < formattedStart.iso) {
                finalEndTime = formattedStart.iso.split("T")[0] + "T23:59:59";
              }

              // Extract text fields
              const summary =
                (occComp.getFirstPropertyValue("summary") as string) ||
                occItem.summary ||
                "(No title)";
              const description =
                (occComp.getFirstPropertyValue("description") as string) ||
                occItem.description ||
                undefined;
              let location =
                (occComp.getFirstPropertyValue("location") as string) ||
                occItem.location ||
                undefined;

              // Fallback to Apple structured location if simple LOCATION is empty
              const structuredLoc = extractAppleStructuredLocation(occComp);
              if (!location && structuredLoc) {
                location = structuredLoc;
              }

              const url =
                (occComp.getFirstPropertyValue("url") as string) || undefined;

              // Detect video meeting provider
              const meetingInfo = extractMeetingInfo({
                location,
                description,
                url,
              });

              const cleanedLocation = cleanLocation(location, meetingInfo.meetingUrl);

              const occId = `${uid}-${nextOccTime.toICALString()}`;

              events.push({
                id: `apple-${occId}`,
                title: summary.trim(),
                description,
                startTime: formattedStart.iso,
                endTime: finalEndTime,
                isAllDay: formattedStart.isAllDay,
                allDay: formattedStart.isAllDay,
                location: cleanedLocation,
                meetingUrl: meetingInfo.meetingUrl,
                meetingProvider: meetingInfo.meetingProvider,
                source: "apple",
                calendarName,
                color: calendarColor,
                updatedAt: new Date().toISOString(),
              });
            }
          } catch (recurErr) {
            console.error(`Error expanding recurring event for UID ${uid}:`, recurErr);
          }
        } else {
          // Single (non-recurring) event
          try {
            const startDate = icalEvent.startDate;
            const endDate = icalEvent.endDate;

            if (startDate) {
              const startJs = startDate.toJSDate();
              const startMs = startJs.getTime();
              const endJs = endDate
                ? endDate.toJSDate()
                : new Date(startMs + 3600000);
              const endMs = endJs.getTime();

              if (endMs >= fromTimeMs && startMs <= toTimeMs) {
                const formattedStart = formatIcalTime(startDate, false);
                const formattedEnd = endDate
                  ? formatIcalTime(endDate, true)
                  : {
                      iso: formattedStart.isAllDay
                        ? formattedStart.iso.split("T")[0] + "T23:59:59"
                        : new Date(startMs + 3600000).toISOString(),
                      isAllDay: formattedStart.isAllDay,
                    };

                let finalEndTime = formattedEnd.iso;
                if (formattedStart.isAllDay && finalEndTime < formattedStart.iso) {
                  finalEndTime = formattedStart.iso.split("T")[0] + "T23:59:59";
                }

                const summary =
                  (master.getFirstPropertyValue("summary") as string) ||
                  icalEvent.summary ||
                  "(No title)";
                const description =
                  (master.getFirstPropertyValue("description") as string) ||
                  icalEvent.description ||
                  undefined;
                let location =
                  (master.getFirstPropertyValue("location") as string) ||
                  icalEvent.location ||
                  undefined;

                const structuredLoc = extractAppleStructuredLocation(master);
                if (!location && structuredLoc) {
                  location = structuredLoc;
                }

                const url =
                  (master.getFirstPropertyValue("url") as string) || undefined;

                const meetingInfo = extractMeetingInfo({
                  location,
                  description,
                  url,
                });

                const cleanedLocation = cleanLocation(
                  location,
                  meetingInfo.meetingUrl
                );

                events.push({
                  id: `apple-${uid}`,
                  title: summary.trim(),
                  description,
                  startTime: formattedStart.iso,
                  endTime: finalEndTime,
                  isAllDay: formattedStart.isAllDay,
                  allDay: formattedStart.isAllDay,
                  location: cleanedLocation,
                  meetingUrl: meetingInfo.meetingUrl,
                  meetingProvider: meetingInfo.meetingProvider,
                  source: "apple",
                  calendarName,
                  color: calendarColor,
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          } catch (singleErr) {
            console.error(`Error parsing single event for UID ${uid}:`, singleErr);
          }
        }
      } else {
        // Orphan exception components without master event: treat each as standalone
        for (const exc of exceptions) {
          try {
            const icalEvent = new ICAL.Event(exc);
            const startDate = icalEvent.startDate;
            const endDate = icalEvent.endDate;

            if (startDate) {
              const startJs = startDate.toJSDate();
              const startMs = startJs.getTime();
              const endJs = endDate
                ? endDate.toJSDate()
                : new Date(startMs + 3600000);
              const endMs = endJs.getTime();

              if (endMs >= fromTimeMs && startMs <= toTimeMs) {
                const formattedStart = formatIcalTime(startDate, false);
                const formattedEnd = endDate
                  ? formatIcalTime(endDate, true)
                  : {
                      iso: formattedStart.isAllDay
                        ? formattedStart.iso.split("T")[0] + "T23:59:59"
                        : new Date(startMs + 3600000).toISOString(),
                      isAllDay: formattedStart.isAllDay,
                    };

                let finalEndTime = formattedEnd.iso;
                if (formattedStart.isAllDay && finalEndTime < formattedStart.iso) {
                  finalEndTime = formattedStart.iso.split("T")[0] + "T23:59:59";
                }

                const summary =
                  (exc.getFirstPropertyValue("summary") as string) ||
                  icalEvent.summary ||
                  "(No title)";
                const description =
                  (exc.getFirstPropertyValue("description") as string) ||
                  icalEvent.description ||
                  undefined;
                let location =
                  (exc.getFirstPropertyValue("location") as string) ||
                  icalEvent.location ||
                  undefined;

                const structuredLoc = extractAppleStructuredLocation(exc);
                if (!location && structuredLoc) {
                  location = structuredLoc;
                }

                const url =
                  (exc.getFirstPropertyValue("url") as string) || undefined;

                const meetingInfo = extractMeetingInfo({
                  location,
                  description,
                  url,
                });

                events.push({
                  id: `apple-${uid}-exc`,
                  title: summary.trim(),
                  description,
                  startTime: formattedStart.iso,
                  endTime: finalEndTime,
                  isAllDay: formattedStart.isAllDay,
                  allDay: formattedStart.isAllDay,
                  location: cleanLocation(location, meetingInfo.meetingUrl),
                  meetingUrl: meetingInfo.meetingUrl,
                  meetingProvider: meetingInfo.meetingProvider,
                  source: "apple",
                  calendarName,
                  color: calendarColor,
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          } catch {}
        }
      }
    }
  } catch (parseError) {
    console.error("ical.js parsing error:", parseError);
  }

  return events;
}
