'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarX2 } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types';
import {
  addDays,
  addMonths,
  eventsOnDay,
  fromKey,
  isAllDay,
  longDate,
  minutesIntoDay,
  monthGrid,
  monthTitle,
  parseEventDate,
  sameMonth,
  todayKey,
  weekDays,
  formatTime,
} from '@/lib/dates';
import { EventCard, eventColor } from './EventCard';
import { EmptyState, Segmented, Sheet, cx } from './ui';

export type CalendarMode = 'day' | 'week' | 'month';

const HOUR_PX = 56;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  events: CalendarEvent[];
  selected: string;
  onSelect: (key: string) => void;
  mode: CalendarMode;
  onModeChange: (m: CalendarMode) => void;
}

export function CalendarView({ events, selected, onSelect, mode, onModeChange }: Props) {
  const today = todayKey();
  const [detail, setDetail] = useState<CalendarEvent | null>(null);

  const step = (dir: 1 | -1) => {
    if (mode === 'day') onSelect(addDays(selected, dir));
    else if (mode === 'week') onSelect(addDays(selected, dir * 7));
    else onSelect(addMonths(selected, dir));
  };

  const title =
    mode === 'day'
      ? fromKey(selected).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : monthTitle(selected);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[22px] font-bold tracking-tight text-fg flex-1 sm:flex-none">{title}</h2>
          <div className="flex items-center gap-1 sm:ml-2">
            <button onClick={() => step(-1)} aria-label="Previous" className="w-9 h-9 rounded-full bg-surface border border-line flex items-center justify-center text-fg hover:bg-surface-2">
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => onSelect(today)}
              className="h-9 px-3.5 rounded-full bg-surface border border-line text-[13px] font-medium text-fg hover:bg-surface-2"
            >
              Today
            </button>
            <button onClick={() => step(1)} aria-label="Next" className="w-9 h-9 rounded-full bg-surface border border-line flex items-center justify-center text-fg hover:bg-surface-2">
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
        <Segmented
          label="Calendar view"
          value={mode}
          onChange={onModeChange}
          className="sm:w-72"
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>

      {mode === 'day' && <DayView events={events} day={selected} onOpen={setDetail} />}
      {mode === 'week' && <WeekView events={events} selected={selected} onSelect={onSelect} onOpen={setDetail} />}
      {mode === 'month' && <MonthView events={events} selected={selected} onSelect={onSelect} />}

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? longDate(dayOf(detail)) : ''}>
        {detail && <EventCard event={detail} defaultOpen />}
      </Sheet>
    </div>
  );
}

function dayOf(e: CalendarEvent): string {
  const d = parseEventDate(e.startTime);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : todayKey();
}

/* ---------------- Day: hour grid ---------------- */

interface Placed {
  event: CalendarEvent;
  top: number;
  height: number;
  col: number;
  cols: number;
}

function layoutDay(events: CalendarEvent[], day: string): Placed[] {
  const dayStart = fromKey(day);
  const items = events
    .filter((e) => !isAllDay(e))
    .map((e) => {
      const s = parseEventDate(e.startTime)!;
      const en = parseEventDate(e.endTime) ?? new Date(+s + 30 * 60000);
      const startMin = Math.max(0, (+s - +dayStart) / 60000);
      const endMin = Math.min(24 * 60, Math.max(startMin + 20, (+en - +dayStart) / 60000));
      return { event: e, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Greedy column packing for overlapping events
  const placed: Placed[] = [];
  let cluster: { item: (typeof items)[number]; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) {
      placed.push({
        event: c.item.event,
        top: (c.item.startMin / 60) * HOUR_PX,
        height: Math.max(22, ((c.item.endMin - c.item.startMin) / 60) * HOUR_PX - 2),
        col: c.col,
        cols,
      });
    }
    cluster = [];
  };
  for (const item of items) {
    if (item.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.item.endMin > item.startMin).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return placed;
}

function DayView({ events, day, onOpen }: { events: CalendarEvent[]; day: string; onOpen: (e: CalendarEvent) => void }) {
  const dayEvents = useMemo(() => eventsOnDay(events, day), [events, day]);
  const allDay = dayEvents.filter(isAllDay);
  const placed = useMemo(() => layoutDay(dayEvents, day), [dayEvents, day]);
  const scroller = useRef<HTMLDivElement>(null);
  const isToday = day === todayKey();
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMin(minutesIntoDay(new Date()));
    tick();
    const t = window.setInterval(tick, 60000);
    return () => window.clearInterval(t);
  }, []);

  // Scroll to "now" (today) or the first event / 8:00
  useEffect(() => {
    const firstTimed = placed[0]?.top;
    const target = isToday ? (minutesIntoDay(new Date()) / 60) * HOUR_PX - 120 : firstTimed !== undefined ? firstTimed - 24 : 8 * HOUR_PX;
    scroller.current?.scrollTo({ top: Math.max(0, target) });
  }, [day, isToday, placed]);

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-baseline justify-between">
        <p className="text-[15px] font-semibold text-fg">{longDate(day)}</p>
        <p className="text-[13px] text-muted">{dayEvents.length ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : 'No events'}</p>
      </div>
      {allDay.length > 0 && (
        <div className="px-3 py-2 border-b border-line flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <button
              key={e.id}
              onClick={() => onOpen(e)}
              className="max-w-full truncate px-2.5 py-1 rounded-lg text-[13px] font-medium text-white"
              style={{ background: eventColor(e) }}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}
      <div ref={scroller} className="relative h-[62dvh] md:h-[640px] overflow-y-auto overscroll-contain">
        <div className="relative" style={{ height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0 flex" style={{ top: h * HOUR_PX }}>
              <span className="w-14 shrink-0 -translate-y-2 pr-2 text-right text-[11px] text-subtle tabular">{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</span>
              <span className="flex-1 border-t border-line" />
            </div>
          ))}
          <div className="absolute top-0 bottom-0 left-14 right-2">
            {placed.map((p) => (
              <button
                key={p.event.id}
                onClick={() => onOpen(p.event)}
                className="absolute rounded-lg px-2 py-1 text-left overflow-hidden border-l-[3px] hover:brightness-95"
                style={{
                  top: p.top + 1,
                  height: p.height,
                  left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                  width: `calc(${100 / p.cols}% - 4px)`,
                  background: `color-mix(in srgb, ${eventColor(p.event)} 16%, var(--surface))`,
                  borderColor: eventColor(p.event),
                }}
              >
                <p className="text-[12.5px] font-semibold text-fg leading-tight truncate">{p.event.title}</p>
                {p.height > 34 && (
                  <p className="text-[11.5px] text-muted tabular truncate">
                    {formatTime(parseEventDate(p.event.startTime))}
                    {p.event.location ? ` · ${p.event.location}` : ''}
                  </p>
                )}
              </button>
            ))}
          </div>
          {isToday && nowMin !== null && (
            <div className="absolute left-12 right-0 flex items-center pointer-events-none" style={{ top: (nowMin / 60) * HOUR_PX }}>
              <span className="w-2.5 h-2.5 rounded-full bg-danger -ml-1" />
              <span className="flex-1 h-[2px] bg-danger" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Week ---------------- */

function WeekView({
  events,
  selected,
  onSelect,
  onOpen,
}: {
  events: CalendarEvent[];
  selected: string;
  onSelect: (k: string) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const days = weekDays(selected);
  const today = todayKey();
  const selectedEvents = useMemo(() => eventsOnDay(events, selected), [events, selected]);

  return (
    <>
      {/* Phones: week strip + cards for the chosen day */}
      <div className="md:hidden space-y-4">
        <div className="grid grid-cols-7 gap-1 p-1.5 rounded-2xl bg-surface border border-line shadow-card">
          {days.map((k, i) => {
            const count = eventsOnDay(events, k).length;
            const active = k === selected;
            return (
              <button
                key={k}
                onClick={() => onSelect(k)}
                aria-pressed={active}
                className={cx('flex flex-col items-center gap-0.5 py-2 rounded-xl', active ? 'bg-accent text-white' : 'text-fg')}
              >
                <span className={cx('text-[11px] font-medium', active ? 'text-white/80' : 'text-subtle')}>{WEEKDAY_LABELS[i].slice(0, 1)}</span>
                <span className={cx('text-[16px] font-semibold tabular', !active && k === today && 'text-accent')}>{fromKey(k).getDate()}</span>
                <span className={cx('h-1.5 w-1.5 rounded-full', count ? (active ? 'bg-white' : 'bg-accent') : 'bg-transparent')} />
              </button>
            );
          })}
        </div>
        <DayAgenda day={selected} events={selectedEvents} />
      </div>

      {/* Larger screens: seven columns */}
      <div className="hidden md:grid grid-cols-7 gap-2">
        {days.map((k, i) => {
          const list = eventsOnDay(events, k);
          const active = k === selected;
          return (
            <div
              key={k}
              className={cx('min-h-[420px] rounded-2xl border p-2 flex flex-col gap-1.5', active ? 'bg-surface border-accent/40' : 'bg-surface border-line')}
            >
              <button onClick={() => onSelect(k)} className="flex items-baseline justify-between px-1 pb-1">
                <span className="text-[12px] font-medium text-subtle">{WEEKDAY_LABELS[i]}</span>
                <span
                  className={cx(
                    'text-[15px] font-semibold tabular w-7 h-7 rounded-full flex items-center justify-center',
                    k === today ? 'bg-accent text-white' : 'text-fg'
                  )}
                >
                  {fromKey(k).getDate()}
                </span>
              </button>
              {list.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpen(e)}
                  className="text-left rounded-lg px-2 py-1.5 border-l-[3px] hover:brightness-95"
                  style={{ background: `color-mix(in srgb, ${eventColor(e)} 14%, var(--surface))`, borderColor: eventColor(e) }}
                >
                  <p className="text-[11px] text-muted tabular">{isAllDay(e) ? 'All day' : formatTime(parseEventDate(e.startTime))}</p>
                  <p className="text-[12.5px] font-medium text-fg leading-snug line-clamp-2">{e.title}</p>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Month ---------------- */

function MonthView({ events, selected, onSelect }: { events: CalendarEvent[]; selected: string; onSelect: (k: string) => void }) {
  const grid = monthGrid(selected);
  const today = todayKey();
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const k of grid) map.set(k, eventsOnDay(events, k));
    return map;
  }, [events, grid]);
  const selectedEvents = byDay.get(selected) ?? eventsOnDay(events, selected);

  return (
    <div className="space-y-4 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-4 md:space-y-0 md:items-start">
      <div className="rounded-2xl bg-surface border border-line shadow-card p-2 md:p-3">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_LABELS.map((d) => (
            <span key={d} className="text-center text-[11px] font-medium text-subtle py-1">
              <span className="md:hidden">{d.slice(0, 1)}</span>
              <span className="hidden md:inline">{d}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 md:gap-1">
          {grid.map((k) => {
            const list = byDay.get(k) ?? [];
            const inMonth = sameMonth(k, selected);
            const active = k === selected;
            const isToday = k === today;
            return (
              <button
                key={k}
                onClick={() => onSelect(k)}
                aria-pressed={active}
                aria-label={`${longDate(k)}, ${list.length} event${list.length === 1 ? '' : 's'}`}
                className={cx(
                  'relative flex flex-col items-center md:items-stretch rounded-xl p-1 md:p-1.5 min-h-[48px] md:min-h-[92px] text-left transition-colors',
                  active ? 'bg-accent-soft ring-1 ring-accent/50' : 'hover:bg-surface-2'
                )}
              >
                <span
                  className={cx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[14px] tabular md:self-end',
                    isToday ? 'bg-accent text-white font-semibold' : inMonth ? 'text-fg' : 'text-subtle/60'
                  )}
                >
                  {fromKey(k).getDate()}
                </span>
                {/* phones: dots */}
                <span className="md:hidden flex gap-0.5 mt-0.5 h-1.5">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: eventColor(e) }} />
                  ))}
                </span>
                {/* desktop: chips */}
                <span className="hidden md:flex flex-col gap-0.5 mt-1 w-full">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className="flex items-center gap-1 min-w-0 text-[11.5px] text-fg">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: eventColor(e) }} />
                      <span className="truncate">{e.title}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-[11px] text-subtle">+{list.length - 3} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <DayAgenda day={selected} events={selectedEvents} />
    </div>
  );
}

/* ---------------- Shared agenda ---------------- */

export function DayAgenda({ day, events }: { day: string; events: CalendarEvent[] }) {
  return (
    <section>
      <h3 className="px-1 mb-2 text-[15px] font-semibold text-fg">{longDate(day)}</h3>
      {events.length === 0 ? (
        <EmptyState icon={<CalendarX2 className="w-5 h-5" />} title="Nothing scheduled" body="Enjoy the free time, or add something with +." />
      ) : (
        <div className="space-y-2.5">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </section>
  );
}
