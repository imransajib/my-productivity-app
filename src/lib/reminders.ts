import type { Task } from '@/lib/types';
import { fromKey } from '@/lib/dates';

/** Time used for reminders on tasks that have a date but no time. */
export const DEFAULT_REMINDER_TIME = '09:00';

export const REMINDER_OPTIONS: { value: number | null; short: string; long: string }[] = [
  { value: null, short: 'None', long: 'No reminder' },
  { value: 0, short: 'At time', long: 'At the time' },
  { value: 10, short: '10 min', long: '10 minutes before' },
  { value: 30, short: '30 min', long: '30 minutes before' },
  { value: 60, short: '1 hour', long: '1 hour before' },
  { value: 1440, short: '1 day', long: '1 day before' },
];

/** Local due moment of a task (date + time, or date at 09:00). */
export function taskDueDate(task: Pick<Task, 'dueDate' | 'scheduledTime'>): Date | null {
  if (!task.dueDate) return null;
  const d = fromKey(task.dueDate);
  const [h, m] = (task.scheduledTime || DEFAULT_REMINDER_TIME).split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function computeReminderAt(task: Pick<Task, 'dueDate' | 'scheduledTime' | 'reminderMin'>): string | null {
  if (task.reminderMin === null || task.reminderMin === undefined) return null;
  const due = taskDueDate(task);
  if (!due) return null;
  return new Date(due.getTime() - task.reminderMin * 60000).toISOString();
}

export function reminderLabel(task: Pick<Task, 'reminderMin' | 'scheduledTime'>): string | null {
  if (task.reminderMin === null || task.reminderMin === undefined) return null;
  const opt = REMINDER_OPTIONS.find((o) => o.value === task.reminderMin);
  if (task.reminderMin === 0 && !task.scheduledTime) return `At ${DEFAULT_REMINDER_TIME}`;
  if (task.reminderMin === 0) return 'At time';
  return `${opt?.short ?? `${task.reminderMin} min`} before`;
}

/** Notification text, e.g. "Due Tue 10 Nov at 14:00". Date-only strings, so safe on a UTC server. */
export function reminderBody(task: Pick<Task, 'dueDate' | 'scheduledTime'>): string {
  if (!task.dueDate) return 'Reminder';
  const day = fromKey(task.dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return task.scheduledTime ? `Due ${day} at ${task.scheduledTime}` : `Due ${day}`;
}
