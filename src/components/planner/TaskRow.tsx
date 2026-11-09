'use client';

import { Bell, Check, Trash2, Clock, CalendarClock } from 'lucide-react';
import type { Task } from '@/lib/types';
import { relativeDayLabel } from '@/lib/dates';
import { reminderLabel } from '@/lib/reminders';
import { cx } from './ui';

const PRIORITY: Record<Task['priority'], { label: string; dot: string }> = {
  urgent: { label: 'Urgent', dot: 'bg-danger' },
  high: { label: 'High', dot: 'bg-warning' },
  medium: { label: 'Medium', dot: 'bg-accent' },
  low: { label: 'Low', dot: 'bg-subtle' },
};

export function TaskRow({
  task,
  onToggle,
  onDelete,
  onEdit,
  showDate = false,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
  showDate?: boolean;
}) {
  const reminder = reminderLabel(task);
  const p = PRIORITY[task.priority] ?? PRIORITY.medium;
  return (
    <div className="group flex items-center gap-3 p-3.5 rounded-2xl bg-surface border border-line shadow-card">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.isCompleted}
        aria-label={task.isCompleted ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        onClick={() => onToggle(task.id)}
        className={cx(
          'w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
          task.isCompleted ? 'bg-success border-success text-white' : 'border-line-strong hover:border-accent'
        )}
      >
        {task.isCompleted && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </button>
      <button type="button" onClick={() => onEdit?.(task)} className="flex-1 min-w-0 text-left" aria-label={`Edit "${task.title}"`}>
        <p className={cx('text-[15px] leading-snug', task.isCompleted ? 'text-subtle line-through' : 'text-fg')}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted tabular">
          <span className="inline-flex items-center gap-1.5">
            <span className={cx('w-1.5 h-1.5 rounded-full', p.dot)} />
            {p.label}
          </span>
          {task.scheduledTime && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {task.scheduledTime}
              {task.durationMin ? ` · ${task.durationMin} min` : ''}
            </span>
          )}
          {showDate && task.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              {relativeDayLabel(task.dueDate)}
            </span>
          )}
          {reminder && !task.isCompleted && (
            <span className="inline-flex items-center gap-1 text-accent">
              <Bell className="w-3 h-3" />
              {reminder}
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label={`Delete "${task.title}"`}
        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-subtle hover:text-danger hover:bg-surface-2 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
