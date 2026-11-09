'use client';

import { useMemo, useState } from 'react';
import { Bell, CalendarDays, Clock, Trash2, X } from 'lucide-react';
import type { CalendarEvent, Priority, Task } from '@/lib/types';
import { addDays, fromKey, relativeDayLabel, todayKey } from '@/lib/dates';
import { parseNaturalLanguageInput } from '@/lib/nlpParser';
import { computeReminderAt, DEFAULT_REMINDER_TIME, REMINDER_OPTIONS } from '@/lib/reminders';
import { Segmented, Sheet, cx } from './ui';

type Kind = 'task' | 'event';

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface Draft {
  kind: Kind;
  title: string;
  date: string; // '' = no date
  time: string; // '' = no time
  reminderMin: number | null;
  priority: Priority;
  durationMin: number;
}

function Chip({ active, children, onClick, disabled }: { active?: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        'min-h-[36px] px-3 rounded-full text-[13.5px] font-medium border transition-colors disabled:opacity-40',
        active ? 'bg-accent text-white border-accent' : 'bg-surface border-line text-fg hover:bg-surface-2'
      )}
    >
      {children}
    </button>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-t border-line first:border-t-0">
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted mb-2">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

/** Create or edit a task (or create an event). Typing "dentist tomorrow 3pm" fills the fields. */
export function TaskComposer({
  open,
  onClose,
  task,
  defaultDate,
  onSaveTask,
  onDeleteTask,
  onSaveEvent,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null; // null = new
  defaultDate: string;
  onSaveTask: (t: Task) => void;
  onDeleteTask: (id: string) => void;
  onSaveEvent: (e: CalendarEvent) => void;
}) {
  // Remount per task so the draft starts fresh
  return open ? (
    <ComposerBody
      key={task?.id ?? `new-${defaultDate}`}
      onClose={onClose}
      task={task}
      defaultDate={defaultDate}
      onSaveTask={onSaveTask}
      onDeleteTask={onDeleteTask}
      onSaveEvent={onSaveEvent}
    />
  ) : null;
}

function ComposerBody({
  onClose,
  task,
  defaultDate,
  onSaveTask,
  onDeleteTask,
  onSaveEvent,
}: Omit<Parameters<typeof TaskComposer>[0], 'open'>) {
  const editing = Boolean(task);
  const [openedAt] = useState(() => Date.now());
  const [draft, setDraft] = useState<Draft>(() => ({
    kind: 'task',
    title: task?.title ?? '',
    date: task ? task.dueDate ?? '' : defaultDate,
    time: task?.scheduledTime ?? '',
    reminderMin: task?.reminderMin ?? null,
    priority: task?.priority ?? 'medium',
    durationMin: 60,
  }));
  // Once the user picks a date/time by hand, typing no longer overrides it
  const [touched, setTouched] = useState({ date: editing, time: editing, priority: editing, kind: editing });

  const parsed = useMemo(() => (!editing && draft.title.trim() ? parseNaturalLanguageInput(draft.title) : null), [draft.title, editing]);
  const effective: Draft = {
    ...draft,
    kind: editing ? 'task' : !touched.kind && parsed?.type === 'event' ? 'event' : draft.kind,
    date: !touched.date && parsed?.date ? parsed.date : draft.date,
    time: !touched.time && parsed?.time ? parsed.time : draft.time,
    priority: !touched.priority && parsed?.priority ? parsed.priority : draft.priority,
    durationMin: parsed?.durationMin ?? draft.durationMin,
  };
  const usedParse = Boolean(parsed && (parsed.date || parsed.time || parsed.priority) && parsed.title);
  const finalTitle = (usedParse && !editing ? parsed!.title : draft.title).trim();

  const set = (patch: Partial<Draft>, mark?: Partial<typeof touched>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (mark) setTouched((t) => ({ ...t, ...mark }));
  };

  const today = todayKey();
  const dateChips = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: addDays(today, 7) },
  ];
  const reminderAt = computeReminderAt({ dueDate: effective.date || undefined, scheduledTime: effective.time || undefined, reminderMin: effective.reminderMin });
  const reminderInPast = reminderAt ? Date.parse(reminderAt) < openedAt : false;

  const save = () => {
    if (!finalTitle) return;
    const now = new Date().toISOString();
    if (effective.kind === 'event' && !editing) {
      const day = effective.date || today;
      const start = effective.time || '';
      const allDay = !start;
      let end = '';
      if (!allDay) {
        const [h, m] = start.split(':').map(Number);
        const endMin = Math.min(23 * 60 + 59, h * 60 + m + effective.durationMin);
        end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      }
      onSaveEvent({
        id: newId('event'),
        title: finalTitle,
        startTime: allDay ? `${day}T00:00:00` : `${day}T${start}:00`,
        endTime: allDay ? `${day}T23:59:59` : `${day}T${end}:00`,
        allDay,
        isAllDay: allDay,
        source: 'local',
        calendarName: 'My calendar',
        updatedAt: now,
      });
    } else {
      const base: Task = task ?? { id: newId('task'), title: '', priority: 'medium', isCompleted: false, subtasks: [], updatedAt: now };
      const next: Task = {
        ...base,
        title: finalTitle,
        dueDate: effective.date || undefined,
        scheduledTime: effective.time || undefined,
        priority: effective.priority,
        reminderMin: effective.date ? effective.reminderMin : null,
        updatedAt: now,
      };
      next.reminderAt = computeReminderAt(next);
      onSaveTask(next);
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit task' : 'New'}
      footer={
        <div className="flex gap-2">
          {editing && (
            <button
              onClick={() => {
                onDeleteTask(task!.id);
                onClose();
              }}
              aria-label="Delete task"
              className="w-12 min-h-[48px] rounded-xl bg-surface-2 text-danger flex items-center justify-center"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!finalTitle}
            className="flex-1 min-h-[48px] rounded-xl bg-accent hover:bg-accent-strong text-white text-[16px] font-semibold disabled:opacity-40"
          >
            {editing ? 'Save' : `Add ${effective.kind}`}
          </button>
        </div>
      }
    >
      {!editing && (
        <Segmented
          label="Type"
          className="mb-3"
          value={effective.kind}
          onChange={(k) => set({ kind: k }, { kind: true })}
          options={[
            { value: 'task', label: 'Task' },
            { value: 'event', label: 'Event' },
          ]}
        />
      )}
      <input
        autoFocus={!editing}
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder={draft.kind === 'event' ? 'e.g. Lunch with Sara tomorrow 1pm' : 'e.g. Call the bank tomorrow 10am'}
        className="w-full min-h-[48px] px-4 rounded-xl bg-surface-2 border border-line text-fg text-[16px] placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {usedParse && !editing && finalTitle !== draft.title.trim() && (
        <p className="mt-1.5 px-1 text-[12.5px] text-muted">
          Will be saved as <span className="text-fg font-medium">“{finalTitle}”</span>
        </p>
      )}

      <div className="mt-2">
        <Field icon={<CalendarDays className="w-4 h-4" />} label="Date">
          <div className="flex flex-wrap gap-2">
            {dateChips.map((c) => (
              <Chip key={c.label} active={effective.date === c.value} onClick={() => set({ date: c.value }, { date: true })}>
                {c.label}
              </Chip>
            ))}
            <label
              className={cx(
                'relative min-h-[36px] px-3 rounded-full text-[13.5px] font-medium border flex items-center gap-1.5 cursor-pointer',
                effective.date && !dateChips.some((c) => c.value === effective.date) ? 'bg-accent text-white border-accent' : 'bg-surface border-line text-fg'
              )}
            >
              {effective.date && !dateChips.some((c) => c.value === effective.date) ? relativeDayLabel(effective.date) : 'Pick date…'}
              <input
                type="date"
                value={effective.date}
                onChange={(e) => set({ date: e.target.value }, { date: true })}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Pick a date"
              />
            </label>
            {effective.kind === 'task' && (
              <Chip active={!effective.date} onClick={() => set({ date: '', reminderMin: null }, { date: true })}>
                No date
              </Chip>
            )}
          </div>
          {effective.date && (
            <p className="mt-2 text-[12.5px] text-muted">{fromKey(effective.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          )}
        </Field>

        <Field icon={<Clock className="w-4 h-4" />} label={effective.kind === 'event' ? 'Start time' : 'Time'}>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={effective.time}
              onChange={(e) => set({ time: e.target.value }, { time: true })}
              disabled={!effective.date && effective.kind === 'task'}
              className="min-h-[40px] px-3 rounded-xl bg-surface-2 border border-line text-fg tabular disabled:opacity-40"
              aria-label="Time"
            />
            {effective.time ? (
              <button onClick={() => set({ time: '' }, { time: true })} className="min-h-[36px] px-3 rounded-full text-[13px] text-muted hover:bg-surface-2 flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> {effective.kind === 'event' ? 'All day' : 'Any time'}
              </button>
            ) : (
              <span className="text-[13px] text-subtle">{effective.kind === 'event' ? 'All day' : 'Any time that day'}</span>
            )}
          </div>
          {effective.kind === 'event' && effective.time && (
            <div className="mt-2 flex flex-wrap gap-2">
              {[30, 60, 90, 120].map((m) => (
                <Chip key={m} active={effective.durationMin === m} onClick={() => set({ durationMin: m })}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </Chip>
              ))}
            </div>
          )}
        </Field>

        {effective.kind === 'task' && (
          <>
            <Field icon={<Bell className="w-4 h-4" />} label="Reminder">
              <div className="flex flex-wrap gap-2">
                {REMINDER_OPTIONS.map((o) => (
                  <Chip
                    key={String(o.value)}
                    active={effective.reminderMin === o.value}
                    disabled={!effective.date && o.value !== null}
                    onClick={() => set({ reminderMin: o.value })}
                  >
                    {o.value === 0 && !effective.time ? `At ${DEFAULT_REMINDER_TIME}` : o.short}
                    {o.value !== null && o.value > 0 ? ' before' : ''}
                  </Chip>
                ))}
              </div>
              {!effective.date && <p className="mt-2 text-[12.5px] text-subtle">Pick a date to set a reminder.</p>}
              {reminderAt && (
                <p className={cx('mt-2 text-[12.5px]', reminderInPast ? 'text-warning' : 'text-muted')}>
                  {reminderInPast ? 'That time has already passed. ' : 'Reminds you '}
                  {!reminderInPast &&
                    new Date(reminderAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </Field>

            <Field icon={<span className="w-4 h-4 flex items-center justify-center text-[13px]">!</span>} label="Priority">
              <Segmented
                label="Priority"
                value={effective.priority}
                onChange={(p) => set({ priority: p }, { priority: true })}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </Field>
          </>
        )}
      </div>
    </Sheet>
  );
}
