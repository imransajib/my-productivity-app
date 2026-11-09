import type { CalendarEvent } from '@/lib/types';

/** All date keys are LOCAL YYYY-MM-DD (never toISOString, which shifts to UTC). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateKey(d);
}

/** Monday-first week containing `key`. */
export function weekDays(key: string): string[] {
  const d = fromKey(key);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return dateKey(x);
  });
}

/** 6×7 Monday-first grid for the month containing `key`. */
export function monthGrid(key: string): string[] {
  const d = fromKey(key);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const x = new Date(first);
    x.setDate(first.getDate() + i);
    return dateKey(x);
  });
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Parse an event time; date-only or floating "YYYY-MM-DDTHH:mm:ss" strings are treated as local. */
export function parseEventDate(value: string | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fromKey(value);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function isAllDay(e: CalendarEvent): boolean {
  return Boolean(e.allDay || e.isAllDay);
}

/** Does the event touch this local day? Handles multi-day and all-day events. */
export function eventOnDay(e: CalendarEvent, key: string): boolean {
  const start = parseEventDate(e.startTime);
  if (!start) return false;
  const end = parseEventDate(e.endTime) ?? start;
  const dayStart = fromKey(key);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (isAllDay(e)) {
    // all-day ends are inclusive (23:59:59) after normalisation
    return start < dayEnd && end >= dayStart;
  }
  return start < dayEnd && (end > dayStart || (+end === +start && start >= dayStart));
}

export function eventsOnDay(events: CalendarEvent[], key: string): CalendarEvent[] {
  return events
    .filter((e) => eventOnDay(e, key))
    .sort((a, b) => {
      const ad = isAllDay(a) ? 0 : 1;
      const bd = isAllDay(b) ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return (parseEventDate(a.startTime)?.getTime() ?? 0) - (parseEventDate(b.startTime)?.getTime() ?? 0);
    });
}

export function formatTime(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatRange(e: CalendarEvent): string {
  if (isAllDay(e)) return 'All day';
  const s = parseEventDate(e.startTime);
  const en = parseEventDate(e.endTime);
  return en ? `${formatTime(s)} – ${formatTime(en)}` : formatTime(s);
}

export function durationLabel(e: CalendarEvent): string {
  if (isAllDay(e)) return 'All day';
  const s = parseEventDate(e.startTime);
  const en = parseEventDate(e.endTime);
  if (!s || !en) return '';
  const mins = Math.round((+en - +s) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function isHappeningNow(e: CalendarEvent, now = new Date()): boolean {
  if (isAllDay(e)) return false;
  const s = parseEventDate(e.startTime);
  const en = parseEventDate(e.endTime);
  return Boolean(s && en && s <= now && now < en);
}

export function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function longDate(key: string): string {
  return fromKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function monthTitle(key: string): string {
  return fromKey(key).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function relativeDayLabel(key: string, today = todayKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return fromKey(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Strip HTML that Google puts in descriptions; keep line breaks. */
export function plainText(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
