import { Category, Task, CalendarEvent } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-work', name: 'Deep Work & Strategy', color: '#6366F1' },
  { id: 'cat-dev', name: 'Engineering & Code', color: '#10B981' },
  { id: 'cat-health', name: 'Health & Wellness', color: '#F59E0B' },
  { id: 'cat-personal', name: 'Personal & Admin', color: '#EC4899' },
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 'task-1',
    title: 'Review production deployment & DNS routing',
    description: 'Verify Vercel edge deployment and SSL certification setup',
    dueDate: '2026-11-09',
    scheduledTime: '11:00',
    durationMin: 45,
    priority: 'high',
    isCompleted: false,
    subtasks: [],
    updatedAt: '2026-11-09T08:00:00.000Z',
    categoryId: 'cat-work',
  },
  {
    id: 'task-2',
    title: 'Draft weekly architecture sprint roadmap',
    description: 'Outline key milestones for calendar sync and NLP enhancements',
    dueDate: '2026-11-09',
    scheduledTime: '14:30',
    durationMin: 60,
    priority: 'urgent',
    isCompleted: false,
    subtasks: [],
    updatedAt: '2026-11-09T08:00:00.000Z',
    categoryId: 'cat-dev',
  },
  {
    id: 'task-3',
    title: '30-minute cardio & strength routine',
    dueDate: '2026-11-09',
    scheduledTime: '17:30',
    durationMin: 30,
    priority: 'medium',
    isCompleted: true,
    completedAt: '2026-11-09T18:00:00.000Z',
    subtasks: [],
    updatedAt: '2026-11-09T18:00:00.000Z',
    categoryId: 'cat-health',
  },
  {
    id: 'task-4',
    title: 'Organize digital inbox and backlog items',
    priority: 'low',
    isCompleted: false,
    subtasks: [],
    updatedAt: '2026-11-09T08:00:00.000Z',
  },
];

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'event-1',
    title: 'Engineering Team Sync',
    description: 'Weekly sprint planning & deployment demo',
    startTime: '2026-11-09T10:00:00',
    endTime: '2026-11-09T10:45:00',
    isAllDay: false,
    allDay: false,
    location: 'Google Meet',
    meetingUrl: 'https://meet.google.com/new',
    meetingProvider: 'meet',
    source: 'google',
    calendarName: 'Team Workspace',
    categoryId: 'cat-work',
    updatedAt: '2026-11-09T08:00:00.000Z',
  },
  {
    id: 'event-2',
    title: 'Product Design & UX Walkthrough',
    description: 'Review interactive dashboard & mobile layout polish',
    startTime: '2026-11-09T15:00:00',
    endTime: '2026-11-09T16:00:00',
    isAllDay: false,
    allDay: false,
    location: 'Design Studio Room 4',
    source: 'local',
    calendarName: 'My Calendar',
    categoryId: 'cat-dev',
    updatedAt: '2026-11-09T08:00:00.000Z',
  },
];

/**
 * Derives a user-namespaced localStorage key for tasks based on their authenticated email.
 */
export function getUserTaskStorageKey(email?: string | null): string {
  if (!email) return 'daily_os_tasks';
  const sanitized = email.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `daily_os_tasks_${sanitized}`;
}

/**
 * Derives a user-namespaced localStorage key for events based on their authenticated email.
 */
export function getUserEventStorageKey(email?: string | null): string {
  if (!email) return 'daily_os_events';
  const sanitized = email.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `daily_os_events_${sanitized}`;
}

/**
 * Derives a user-namespaced localStorage key for onboarding status.
 */
export function getUserOnboardingKey(email?: string | null): string {
  if (!email) return 'apex_onboarding_completed';
  const sanitized = email.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `apex_onboarding_completed_${sanitized}`;
}

/**
 * Derives a user-namespaced localStorage key for selected Google calendar IDs.
 */
export function getUserGoogleSelectedCalendarsKey(email?: string | null): string {
  if (!email) return 'apex_google_calendars';
  const sanitized = email.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `apex_google_calendars_${sanitized}`;
}

/**
 * Derives a user-namespaced localStorage key for last sync timestamp.
 */
export function getUserLastSyncedKey(email?: string | null): string {
  if (!email) return 'apex_last_synced';
  const sanitized = email.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `apex_last_synced_${sanitized}`;
}

export function getLocalData<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error loading ${key} from localStorage:`, err);
    return fallback;
  }
}

export function saveLocalData<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving ${key} to localStorage:`, err);
  }
}
