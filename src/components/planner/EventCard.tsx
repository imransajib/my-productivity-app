'use client';

import { useId, useState } from 'react';
import { ChevronDown, MapPin, Video, CalendarDays, Clock, AlignLeft, ExternalLink } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types';
import { durationLabel, formatRange, isAllDay, isHappeningNow, plainText } from '@/lib/dates';
import { getMapsSearchUrl, getProviderDisplayName } from '@/lib/meetingLinks';
import { cx } from './ui';

export function eventColor(e: CalendarEvent): string {
  if (e.color) return e.color;
  if (e.source === 'google') return 'var(--google)';
  if (e.source === 'apple') return 'var(--apple)';
  return 'var(--accent)';
}

function SourceBadge({ source }: { source?: string }) {
  if (source !== 'google' && source !== 'apple') return null;
  return (
    <span
      className={cx(
        'inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium',
        source === 'google' ? 'bg-google/12 text-google' : 'bg-apple/12 text-apple'
      )}
    >
      {source === 'google' ? 'Google' : 'Apple'}
    </span>
  );
}

/** One card per event. Tap the row (or chevron) to see location, meeting link and notes. */
export function EventCard({ event, defaultOpen = false }: { event: CalendarEvent; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const panelId = useId();
  const now = isHappeningNow(event);
  const notes = plainText(event.description);
  const provider = event.meetingUrl ? getProviderDisplayName(event.meetingProvider) : null;
  const subtitle = event.location || provider || event.calendarName;

  return (
    <article className={cx('rounded-2xl bg-surface border transition-colors', now ? 'border-accent/40' : 'border-line', 'shadow-card')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-stretch gap-3 p-3.5 text-left"
      >
        <span className="w-1 rounded-full shrink-0" style={{ background: eventColor(event) }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-muted tabular">
            <span>{formatRange(event)}</span>
            {now && <span className="px-1.5 py-0.5 rounded-md bg-accent text-white text-[11px] font-semibold">Now</span>}
          </div>
          <p className="mt-0.5 text-[15px] font-semibold text-fg leading-snug line-clamp-2">{event.title}</p>
          {subtitle && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted min-w-0">
              {event.location ? (
                <MapPin className="w-3.5 h-3.5 shrink-0" />
              ) : provider ? (
                <Video className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{subtitle}</span>
            </p>
          )}
        </div>
        <span
          className={cx(
            'self-center w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-subtle transition-transform',
            open && 'rotate-180 bg-surface-2 text-fg'
          )}
          aria-hidden
        >
          <ChevronDown className="w-4.5 h-4.5" />
        </span>
      </button>

      {open && (
        <div id={panelId} className="px-3.5 pb-3.5 -mt-1 space-y-3 animate-fade-in">
          <div className="h-px bg-line" />
          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl bg-accent hover:bg-accent-strong text-white text-[15px] font-semibold"
            >
              <Video className="w-4.5 h-4.5" />
              Join {provider}
            </a>
          )}
          <dl className="space-y-2.5 text-[14px]">
            <div className="flex gap-3">
              <dt className="sr-only">Time</dt>
              <Clock className="w-4 h-4 mt-0.5 text-subtle shrink-0" />
              <dd className="text-fg tabular">
                {formatRange(event)}
                {!isAllDay(event) && <span className="text-muted"> · {durationLabel(event)}</span>}
              </dd>
            </div>
            {event.location && (
              <div className="flex gap-3">
                <dt className="sr-only">Location</dt>
                <MapPin className="w-4 h-4 mt-0.5 text-subtle shrink-0" />
                <dd className="min-w-0">
                  <a
                    href={getMapsSearchUrl(event.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline break-words inline-flex items-start gap-1"
                  >
                    {event.location}
                    <ExternalLink className="w-3 h-3 mt-1 shrink-0" />
                  </a>
                </dd>
              </div>
            )}
            <div className="flex gap-3 items-center">
              <dt className="sr-only">Calendar</dt>
              <CalendarDays className="w-4 h-4 text-subtle shrink-0" />
              <dd className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: eventColor(event) }} />
                <span className="text-fg truncate">{event.calendarName || 'My calendar'}</span>
                <SourceBadge source={event.source} />
              </dd>
            </div>
            {notes && (
              <div className="flex gap-3">
                <dt className="sr-only">Notes</dt>
                <AlignLeft className="w-4 h-4 mt-0.5 text-subtle shrink-0" />
                <dd className="min-w-0 text-muted whitespace-pre-line break-words">
                  <span className={cx(!showAllNotes && 'line-clamp-4')}>{notes}</span>
                  {notes.length > 220 && (
                    <button onClick={() => setShowAllNotes((s) => !s)} className="block mt-1 text-accent text-[13px] font-medium">
                      {showAllNotes ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </article>
  );
}
