export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export type MeetingProvider = 'meet' | 'zoom' | 'teams' | 'webex' | 'other';

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:mm
  durationMin?: number;
  priority: Priority;
  isCompleted: boolean;
  completedAt?: string;
  updatedAt: string;
  subtasks: Subtask[];
  categoryId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO string e.g. YYYY-MM-DDTHH:mm:ss
  endTime: string; // ISO string
  isAllDay?: boolean;
  allDay?: boolean;
  location?: string;
  meetingUrl?: string;
  meetingProvider?: MeetingProvider;
  source: 'google' | 'apple' | 'local' | 'ics' | string;
  calendarName?: string;
  color?: string;
  categoryId?: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface CalendarConnection {
  id: string;
  type: 'google' | 'apple' | 'ics';
  name: string;
  url?: string;
  connectedAt: string;
  lastSyncedAt?: string;
  isActive: boolean;
}

export interface ParsedNLPResult {
  type: 'task' | 'event';
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  durationMin?: number;
  priority?: Priority;
}
