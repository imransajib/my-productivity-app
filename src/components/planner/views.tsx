'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  ListTodo,
  Monitor,
  Moon,
  Sun,
  Bell,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { CalendarEvent, Task } from '@/lib/types';
import { addDays, eventsOnDay, fromKey, isAllDay, isHappeningNow, longDate, parseEventDate, relativeDayLabel, todayKey, weekDays } from '@/lib/dates';
import type { ThemePref } from '@/lib/useTheme';
import { EventCard } from './EventCard';
import { TaskRow } from './TaskRow';
import { EmptyState, Segmented, SectionTitle, cx } from './ui';

/* ---------------- Today ---------------- */

export function TodayView({
  greeting,
  name,
  day,
  onSelectDay,
  events,
  tasks,
  onToggleTask,
  onDeleteTask,
  onMoveOverdue,
  onAdd,
}: {
  greeting: string;
  name?: string | null;
  day: string;
  onSelectDay: (k: string) => void;
  events: CalendarEvent[];
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onMoveOverdue: () => void;
  onAdd: () => void;
}) {
  const today = todayKey();
  const days = weekDays(day);
  const dayEvents = useMemo(() => eventsOnDay(events, day), [events, day]);
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === day)
        .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted) || (a.scheduledTime ?? '99').localeCompare(b.scheduledTime ?? '99')),
    [tasks, day]
  );
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.isCompleted);
  const done = dayTasks.filter((t) => t.isCompleted).length;
  const pct = dayTasks.length ? Math.round((done / dayTasks.length) * 100) : 0;

  const upNext = useMemo(() => {
    if (day !== today) return null;
    const now = new Date();
    return (
      dayEvents.find((e) => isHappeningNow(e, now)) ??
      dayEvents.find((e) => !isAllDay(e) && (parseEventDate(e.startTime)?.getTime() ?? 0) > now.getTime()) ??
      null
    );
  }, [dayEvents, day, today]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[13px] font-medium text-muted">{longDate(day)}</p>
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-fg leading-tight">
          {day === today ? `${greeting}${name ? `, ${name.split(' ')[0]}` : ''}` : relativeDayLabel(day)}
        </h1>
      </header>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1 p-1.5 rounded-2xl bg-surface border border-line shadow-card">
        {days.map((k) => {
          const active = k === day;
          const has = eventsOnDay(events, k).length > 0 || tasks.some((t) => t.dueDate === k && !t.isCompleted);
          return (
            <button
              key={k}
              onClick={() => onSelectDay(k)}
              aria-pressed={active}
              className={cx('flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors', active ? 'bg-accent text-white' : 'hover:bg-surface-2')}
            >
              <span className={cx('text-[11px] font-medium', active ? 'text-white/80' : 'text-subtle')}>
                {fromKey(k).toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
              <span className={cx('text-[16px] font-semibold tabular', !active && (k === today ? 'text-accent' : 'text-fg'))}>{fromKey(k).getDate()}</span>
              <span className={cx('h-1.5 w-1.5 rounded-full', has ? (active ? 'bg-white' : 'bg-accent') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>

      {overdue.length > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-warning/10 border border-warning/25">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <p className="flex-1 text-[14px] text-fg">
            {overdue.length} overdue task{overdue.length > 1 ? 's' : ''}
          </p>
          <button onClick={onMoveOverdue} className="min-h-[36px] px-3 rounded-lg bg-surface border border-line text-[13px] font-medium text-fg flex items-center gap-1">
            Move to today <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[12px] font-medium text-subtle uppercase tracking-wide">Tasks</p>
          <p className="mt-1 text-[22px] font-bold text-fg tabular">
            {done}
            <span className="text-muted text-[15px] font-medium">/{dayTasks.length}</span>
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card min-w-0">
          <p className="text-[12px] font-medium text-subtle uppercase tracking-wide">{upNext ? (isHappeningNow(upNext) ? 'Now' : 'Up next') : 'Events'}</p>
          {upNext ? (
            <>
              <p className="mt-1 text-[15px] font-semibold text-fg truncate">{upNext.title}</p>
              <p className="text-[13px] text-muted tabular">
                {parseEventDate(upNext.startTime)?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[22px] font-bold text-fg tabular">{dayEvents.length}</p>
          )}
        </div>
      </div>

      <section>
        <SectionTitle>Schedule</SectionTitle>
        {dayEvents.length === 0 ? (
          <EmptyState icon={<CalendarCheck2 className="w-5 h-5" />} title="No events" body="Your calendars are clear for this day." />
        ) : (
          <div className="space-y-2.5">
            {dayEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          action={
            <button onClick={onAdd} className="text-[13px] font-medium text-accent flex items-center gap-1 min-h-[32px]">
              <Plus className="w-4 h-4" /> Add
            </button>
          }
        >
          Tasks
        </SectionTitle>
        {dayTasks.length === 0 ? (
          <EmptyState icon={<ListTodo className="w-5 h-5" />} title="No tasks" body='Tap + and type something like "Call bank tomorrow 10am".' />
        ) : (
          <div className="space-y-2">
            {dayTasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggleTask} onDelete={onDeleteTask} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Tasks ---------------- */

type TaskFilter = 'today' | 'upcoming' | 'someday' | 'done';

export function TasksView({
  tasks,
  onToggleTask,
  onDeleteTask,
  onAdd,
}: {
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>('today');
  const today = todayKey();

  const groups = useMemo(() => {
    const open = tasks.filter((t) => !t.isCompleted);
    const byTime = (a: Task, b: Task) =>
      (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || (a.scheduledTime ?? '99').localeCompare(b.scheduledTime ?? '99');
    if (filter === 'today') {
      return [
        { title: 'Overdue', items: open.filter((t) => t.dueDate && t.dueDate < today).sort(byTime) },
        { title: 'Today', items: open.filter((t) => t.dueDate === today).sort(byTime) },
      ];
    }
    if (filter === 'upcoming') {
      const later = open.filter((t) => t.dueDate && t.dueDate > today).sort(byTime);
      const map = new Map<string, Task[]>();
      for (const t of later) map.set(t.dueDate!, [...(map.get(t.dueDate!) ?? []), t]);
      return [...map.entries()].map(([k, items]) => ({ title: relativeDayLabel(k), items }));
    }
    if (filter === 'someday') return [{ title: 'No date', items: open.filter((t) => !t.dueDate) }];
    return [
      {
        title: 'Completed',
        items: tasks.filter((t) => t.isCompleted).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
      },
    ];
  }, [tasks, filter, today]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-fg">Tasks</h1>
        <button onClick={onAdd} className="hidden md:flex min-h-[40px] px-4 rounded-xl bg-accent hover:bg-accent-strong text-white text-[14px] font-medium items-center gap-1.5">
          <Plus className="w-4 h-4" /> New task
        </button>
      </div>
      <Segmented
        label="Task filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'someday', label: 'No date' },
          { value: 'done', label: 'Done' },
        ]}
      />
      {total === 0 ? (
        <EmptyState icon={<CheckCircle2 className="w-5 h-5" />} title={filter === 'done' ? 'Nothing completed yet' : 'All clear'} />
      ) : (
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.title}>
              <SectionTitle>{g.title}</SectionTitle>
              <div className="space-y-2">
                {g.items.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={onToggleTask} onDelete={onDeleteTask} showDate={filter !== 'upcoming'} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

/* ---------------- Review ---------------- */

export function ReviewView({ tasks, events }: { tasks: Task[]; events: CalendarEvent[] }) {
  const today = todayKey();
  const week = weekDays(today);
  const weekStart = week[0];
  const weekEnd = addDays(week[6], 1);

  const stats = useMemo(() => {
    const completedThisWeek = tasks.filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) < weekEnd);
    const dueThisWeek = tasks.filter((t) => t.dueDate && t.dueDate >= weekStart && t.dueDate < weekEnd);
    const doneDue = dueThisWeek.filter((t) => t.isCompleted).length;
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !t.isCompleted).length;
    const eventCount = week.reduce((n, k) => n + eventsOnDay(events, k).length, 0);
    const perDay = week.map((k) => ({
      k,
      done: tasks.filter((t) => t.completedAt?.slice(0, 10) === k).length,
      events: eventsOnDay(events, k).length,
    }));
    return {
      completed: completedThisWeek.length,
      rate: dueThisWeek.length ? Math.round((doneDue / dueThisWeek.length) * 100) : 0,
      overdue,
      eventCount,
      perDay,
    };
  }, [tasks, events, week, weekStart, weekEnd, today]);

  const max = Math.max(1, ...stats.perDay.map((d) => d.done + d.events));

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-fg">This week</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: 'Completed', value: stats.completed },
          { label: 'On-time rate', value: `${stats.rate}%` },
          { label: 'Overdue', value: stats.overdue },
          { label: 'Events', value: stats.eventCount },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-2xl bg-surface border border-line shadow-card">
            <p className="text-[12px] font-medium text-subtle uppercase tracking-wide">{s.label}</p>
            <p className="mt-1 text-[24px] font-bold text-fg tabular">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
        <p className="text-[15px] font-semibold text-fg">Daily activity</p>
        <p className="text-[13px] text-muted">Tasks completed and events, Monday to Sunday</p>
        <div className="mt-4 grid grid-cols-7 gap-2 items-end h-36">
          {stats.perDay.map((d) => (
            <div key={d.k} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <div className="w-full max-w-8 flex flex-col justify-end h-full gap-0.5">
                <div className="w-full rounded-t-md bg-accent/35" style={{ height: `${(d.events / max) * 100}%` }} title={`${d.events} events`} />
                <div className="w-full rounded-md bg-success" style={{ height: `${(d.done / max) * 100}%` }} title={`${d.done} done`} />
              </div>
              <span className={cx('text-[11px] tabular', d.k === today ? 'text-accent font-semibold' : 'text-subtle')}>
                {fromKey(d.k).toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-success" /> Tasks done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent/35" /> Events
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Settings: appearance + notifications ---------------- */

export function AppearanceSettings({ theme, onTheme }: { theme: ThemePref; onTheme: (t: ThemePref) => void }) {
  const [notif, setNotif] = useState<string>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  return (
    <section className="max-w-2xl mx-auto rounded-2xl bg-surface border border-line shadow-card overflow-hidden">
      <div className="p-4 border-b border-line">
        <h3 className="text-[15px] font-semibold text-fg">Appearance</h3>
        <p className="text-[13px] text-muted">Choose light, dark, or follow your device</p>
      </div>
      <div className="p-4">
        <Segmented
          label="Theme"
          value={theme}
          onChange={onTheme}
          options={[
            { value: 'system', label: <><Monitor className="w-4 h-4" /> System</> },
            { value: 'light', label: <><Sun className="w-4 h-4" /> Light</> },
            { value: 'dark', label: <><Moon className="w-4 h-4" /> Dark</> },
          ]}
        />
      </div>
      {notif !== 'unsupported' && (
        <div className="px-4 pb-4 flex items-center gap-3">
          <Bell className="w-4 h-4 text-subtle" />
          <p className="flex-1 text-[14px] text-fg">Notifications</p>
          {notif === 'granted' ? (
            <span className="text-[13px] text-success font-medium">On</span>
          ) : (
            <button
              onClick={async () => setNotif(await Notification.requestPermission())}
              className="min-h-[36px] px-3 rounded-lg bg-surface-2 text-[13px] font-medium text-fg"
            >
              {notif === 'denied' ? 'Blocked in browser' : 'Turn on'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function SignInCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-5 bg-bg">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-16 h-16 rounded-[20px] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center shadow-xl shadow-indigo-500/25">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="mt-5 text-[28px] font-bold tracking-tight text-fg">Apex Planner</h1>
        <p className="mt-2 text-[15px] text-muted">Your Google and Apple calendars, tasks and meeting links in one calm place.</p>
        <ul className="mt-6 space-y-2.5 text-left">
          {['Google + Apple Calendar in one timeline', 'Join meetings with one tap', 'Syncs across your phone and computer'].map((f) => (
            <li key={f} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-line text-[14px] text-fg">
              <CheckCircle2 className="w-4.5 h-4.5 text-success shrink-0" />
              {f}
            </li>
          ))}
        </ul>
        <button
          onClick={onSignIn}
          className="mt-6 w-full min-h-[50px] rounded-2xl bg-fg text-bg text-[16px] font-semibold flex items-center justify-center gap-3 active:scale-[0.99] transition-transform"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Continue with Google
        </button>
        <p className="mt-3 text-[12px] text-subtle">Read-only calendar access. You can disconnect any time.</p>
      </div>
    </div>
  );
}
