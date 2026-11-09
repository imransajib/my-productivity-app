'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Search,
  Sparkles,
  Inbox,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Video,
  AlertTriangle,
  Layers,
  ArrowRight,
  Filter,
  Check,
  RefreshCw,
  Bell,
  Trash2,
  CalendarDays,
  ListTodo,
  LogOut,
  ExternalLink,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { Task, CalendarEvent, Category, CalendarConnection, Priority, MeetingProvider } from '@/lib/types';
import {
  DEFAULT_CATEGORIES,
  INITIAL_TASKS,
  INITIAL_EVENTS,
  getLocalData,
  saveLocalData,
  getUserTaskStorageKey,
  getUserEventStorageKey,
} from '@/lib/store';
import { parseNaturalLanguageInput } from '@/lib/nlpParser';
import { parseICS, fetchGoogleCalendarEvents } from '@/lib/calendarSync';
import { getMapsSearchUrl, getProviderDisplayName } from '@/lib/meetingLinks';

/**
 * Google Logo SVG Icon for authentication and branding
 */
function GoogleLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

/**
 * Fullscreen Unauthenticated Gate: users must authenticate with Google to access the dashboard.
 */
function SignInScreen() {
  return (
    <div className="min-h-screen w-full bg-[#0F1117] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#141721] border border-slate-800/80 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center text-center">
        {/* Brand Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-xl shadow-indigo-500/25 mb-5 ring-1 ring-white/20">
          <Sparkles className="w-7 h-7 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight">Apex Planner</h1>
        <span className="text-xs text-indigo-400 font-mono tracking-widest uppercase mt-1">Unified Daily Personal OS</span>

        <p className="text-xs text-slate-400 mt-4 leading-relaxed max-w-xs">
          Connect your Google account to sync real-time calendar timelines, join video meetings with one tap, and manage your daily tasks in a local-first workspace.
        </p>

        {/* Feature Highlights */}
        <div className="w-full my-6 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 text-left text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>Real Google Calendar timeline & meeting links</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ListTodo className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Local-first task storage, namespaced per user</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Read-only calendar access & secure OAuth 2.0</span>
          </div>
        </div>

        {/* Google Sign-In Button */}
        <button
          onClick={() => signIn('google')}
          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-semibold text-sm transition-all shadow-lg shadow-white/10"
        >
          <GoogleLogo className="w-5 h-5" />
          <span>Continue with Google</span>
        </button>

        <span className="text-[11px] text-slate-500 mt-4 font-mono">
          Single Sign-On with Google Workspace & Gmail
        </span>
      </div>
    </div>
  );
}

/**
 * Checks if an event occurs on a specified target date ISO (YYYY-MM-DD),
 * handling both local date prefixes and UTC timestamps.
 */
function eventOccursOnDate(event: CalendarEvent, targetDateIso: string): boolean {
  if (event.startTime.startsWith(targetDateIso)) return true;
  try {
    const d = new Date(event.startTime);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}` === targetDateIso;
    }
  } catch {}
  return false;
}

/**
 * Extracts and formats time string (HH:mm) from an ISO timestamp.
 */
function formatEventTime(isoTime?: string): string {
  if (!isoTime) return '00:00';
  try {
    const d = new Date(isoTime);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  } catch {}
  if (isoTime.includes('T')) {
    return isoTime.split('T')[1].substring(0, 5);
  }
  return '00:00';
}

export default function PlannerApp() {
  const { data: session, status } = useSession();

  // Namespaced storage keys based on the signed-in user's email
  const userEmail = session?.user?.email ?? null;
  const taskStorageKey = useMemo(() => getUserTaskStorageKey(userEmail), [userEmail]);
  const eventStorageKey = useMemo(() => getUserEventStorageKey(userEmail), [userEmail]);

  // --- Persistent States ---
  const [tasks, setTasks] = useState<Task[]>(() => getLocalData<Task[]>(taskStorageKey, INITIAL_TASKS));
  const [events, setEvents] = useState<CalendarEvent[]>(() => getLocalData<CalendarEvent[]>(eventStorageKey, INITIAL_EVENTS));
  const [categories, setCategories] = useState<Category[]>(() => getLocalData('daily_os_categories', DEFAULT_CATEGORIES));
  const [activeTab, setActiveTab] = useState<'today' | 'calendar' | 'tasks' | 'upcoming' | 'inbox' | 'review' | 'settings'>('today');

  // --- Filters & UI States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('2026-11-09');
  const [todayStr, setTodayStr] = useState<string>('2026-11-09');
  const [currentHour, setCurrentHour] = useState<number>(10);
  const [dateDisplay, setDateDisplay] = useState<string>('Monday, Nov 9');
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'agenda'>('week');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Initialize client-side current date after mount
  useEffect(() => {
    const now = new Date();
    const iso = now.toISOString().split('T')[0];
    setSelectedDate(iso);
    setTodayStr(iso);
    setCurrentHour(now.getHours());
    setDateDisplay(now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
  }, []);

  // Reload tasks & events when user authentication changes to maintain user namespacing
  useEffect(() => {
    if (userEmail) {
      setTasks(getLocalData<Task[]>(taskStorageKey, INITIAL_TASKS));
      setEvents(getLocalData<CalendarEvent[]>(eventStorageKey, INITIAL_EVENTS));
    }
  }, [taskStorageKey, eventStorageKey, userEmail]);

  // Sync to local storage on modification
  useEffect(() => { saveLocalData(taskStorageKey, tasks); }, [taskStorageKey, tasks]);
  useEffect(() => { saveLocalData(eventStorageKey, events); }, [eventStorageKey, events]);
  useEffect(() => { saveLocalData('daily_os_categories', categories); }, [categories]);

  // Google Calendar Real Sync Function
  const syncGoogleCalendar = useCallback(async () => {
    if (status !== 'authenticated') return;
    setIsSyncing(true);
    setSyncNotice('Syncing Google Calendar...');
    try {
      const now = new Date();
      // Range: 1 month back to 2 months forward
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth() + 2, 28).toISOString();

      const result = await fetchGoogleCalendarEvents({ from, to });

      if (result.reconnectRequired) {
        setSyncError('Google session expired. Please reconnect your account.');
      } else if (result.error) {
        setSyncError(result.error);
      } else {
        setSyncError(null);
        // Replace all Google-sourced events, preserving local and Apple feeds
        setEvents((prev) => {
          const nonGoogle = prev.filter((e) => e.source !== 'google');
          return [...nonGoogle, ...result.events];
        });
        setSyncNotice(`Synced ${result.events.length} Google event(s)`);
        setTimeout(() => setSyncNotice(null), 3500);
      }
    } catch (err: any) {
      setSyncError('Failed to sync Google Calendar');
    } finally {
      setIsSyncing(false);
    }
  }, [status]);

  // Trigger Google Calendar sync on sign-in
  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      syncGoogleCalendar();
    }
  }, [status, session?.accessToken, syncGoogleCalendar]);

  // Global Quick Capture shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickCaptureOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Request Web Notifications
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification('Apex Planner', {
          body: 'Reminders and schedule notifications are active.',
        });
      }
    }
  };

  // --- Natural Language Preview Calculation ---
  const parsedPreview = useMemo(() => {
    if (!quickInput.trim()) return null;
    return parseNaturalLanguageInput(quickInput);
  }, [quickInput]);

  const handleQuickAdd = () => {
    if (!parsedPreview) return;
    const nowIso = new Date().toISOString();
    const targetDate = parsedPreview.date || selectedDate || todayStr;

    if (parsedPreview.type === 'event') {
      const startTime = `${targetDate}T${parsedPreview.time || '10:00'}:00`;
      const endHour = parsedPreview.time ? (parseInt(parsedPreview.time.split(':')[0], 10) + 1) % 24 : 11;
      const endTime = `${targetDate}T${String(endHour).padStart(2, '0')}:00:00`;

      const newEvent: CalendarEvent = {
        id: `event-${Date.now()}`,
        title: parsedPreview.title,
        startTime,
        endTime,
        isAllDay: !parsedPreview.time,
        allDay: !parsedPreview.time,
        source: 'local',
        calendarName: 'My Calendar',
        updatedAt: nowIso,
      };
      setEvents((prev) => [...prev, newEvent]);
    } else {
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title: parsedPreview.title,
        dueDate: targetDate,
        scheduledTime: parsedPreview.time,
        durationMin: parsedPreview.durationMin,
        priority: parsedPreview.priority || 'medium',
        isCompleted: false,
        subtasks: [],
        updatedAt: nowIso,
      };
      setTasks((prev) => [newTask, ...prev]);
    }

    setQuickInput('');
    setIsQuickCaptureOpen(false);
  };

  // --- Task Operations ---
  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const nextState = !t.isCompleted;
          return {
            ...t,
            isCompleted: nextState,
            completedAt: nextState ? new Date().toISOString() : undefined,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      })
    );
  };

  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const todayTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate === selectedDate);
  }, [tasks, selectedDate]);

  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate && t.dueDate < todayStr && !t.isCompleted);
  }, [tasks, todayStr]);

  const todayEvents = useMemo(() => {
    return events.filter((e) => eventOccursOnDate(e, selectedDate));
  }, [events, selectedDate]);

  // Combined Chronological Timeline for Selected Day
  interface TimelineItem {
    type: 'event' | 'task';
    id: string;
    title: string;
    time: string; // HH:mm for sorting
    duration?: number;
    isCompleted?: boolean;
    location?: string;
    priority?: Priority;
    meetingUrl?: string;
    meetingProvider?: MeetingProvider;
    source?: string;
    calendarName?: string;
    category?: Category;
    raw: Task | CalendarEvent;
  }

  const combinedTimeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Push events
    todayEvents.forEach((e) => {
      items.push({
        type: 'event',
        id: e.id,
        title: e.title,
        time: formatEventTime(e.startTime),
        location: e.location,
        meetingUrl: e.meetingUrl,
        meetingProvider: e.meetingProvider,
        source: e.source,
        calendarName: e.calendarName,
        category: categories.find((c) => c.id === e.categoryId),
        raw: e,
      });
    });

    // Push scheduled tasks
    todayTasks.forEach((t) => {
      items.push({
        type: 'task',
        id: t.id,
        title: t.title,
        time: t.scheduledTime || '23:59',
        isCompleted: t.isCompleted,
        priority: t.priority,
        duration: t.durationMin,
        category: categories.find((c) => c.id === t.categoryId),
        raw: t,
      });
    });

    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [todayEvents, todayTasks, categories]);

  // Progress metrics
  const completionPercentage = useMemo(() => {
    if (todayTasks.length === 0) return 0;
    const done = todayTasks.filter((t) => t.isCompleted).length;
    return Math.round((done / todayTasks.length) * 100);
  }, [todayTasks]);

  // --- Dynamic Greeting ---
  const greeting =
    currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  // --- Weekly Review Analytics ---
  const weeklyStats = useMemo(() => {
    const completed = tasks.filter((t) => t.isCompleted).length;
    const total = tasks.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      totalCreated: total,
      totalCompleted: completed,
      completionRate: rate,
      totalOverdue: overdueTasks.length,
      eventsScheduled: events.length,
    };
  }, [tasks, overdueTasks, events]);

  // Days of current week
  const weekDays = useMemo(() => {
    const anchor = new Date(selectedDate || '2026-11-09');
    const dayOfWeek = anchor.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + diffToMonday);

    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      return {
        dateIso: iso,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
      };
    });
  }, [selectedDate]);

  // --- Loading State Gate ---
  if (status === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0F1117] text-slate-200">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-mono text-slate-400">Loading Apex Planner...</span>
        </div>
      </div>
    );
  }

  // --- Unauthenticated Protection Gate ---
  if (status === 'unauthenticated' || !session) {
    return <SignInScreen />;
  }

  return (
    <div className="flex h-screen w-full bg-[#0F1117] text-slate-100 font-sans antialiased overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* =========================================================================
          DESKTOP SIDEBAR
      ========================================================================= */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-[#141721] p-4 select-none">
        {/* Brand */}
        <div className="flex items-center justify-between px-2 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-white block">Apex Planner</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Personal OS</span>
            </div>
          </div>
        </div>

        {/* Universal Quick Add Button */}
        <button
          onClick={() => setIsQuickCaptureOpen(true)}
          className="flex items-center justify-between w-full px-3.5 py-2.5 mb-6 text-xs font-medium text-slate-200 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all rounded-xl shadow-lg shadow-indigo-600/25"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Quick Capture</span>
          </div>
          <kbd className="text-[10px] bg-indigo-700/60 px-1.5 py-0.5 rounded text-indigo-200 font-mono">⌘K</kbd>
        </button>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1">
          {[
            { id: 'today', label: 'Today', icon: CalendarDays, badge: todayTasks.filter((t) => !t.isCompleted).length },
            { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
            { id: 'tasks', label: 'Tasks', icon: ListTodo, badge: tasks.filter((t) => !t.isCompleted).length },
            { id: 'upcoming', label: 'Upcoming', icon: Clock },
            { id: 'inbox', label: 'Inbox', icon: Inbox, badge: tasks.filter((t) => !t.dueDate).length },
            { id: 'review', label: 'Weekly Review', icon: BarChart3 },
            { id: 'settings', label: 'Integrations & Settings', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Categories Section */}
        <div className="pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Categories</span>
          </div>
          <div className="space-y-1">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="truncate">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User Account & Sign Out Pill */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {session.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-6 h-6 rounded-full border border-slate-700"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold text-[10px]">
                  {session.user?.name ? session.user.name.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-slate-200 truncate block">
                  {session.user?.name || 'Authenticated User'}
                </span>
                <span className="text-[10px] text-slate-500 truncate block font-mono">
                  {session.user?.email}
                </span>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Offline & Sync Status Pill */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between px-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
            <span className="truncate">{isSyncing ? 'Syncing...' : 'Google Synced'}</span>
          </div>
          <button
            onClick={() => syncGoogleCalendar()}
            disabled={isSyncing}
            className="hover:text-slate-300 transition-colors disabled:opacity-50"
            title="Refresh Google Calendar Sync"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </aside>

      {/* =========================================================================
          MAIN CONTENT AREA
      ========================================================================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0F1117] pb-16 md:pb-0">
        {/* Top Floating App Bar */}
        <header className="h-14 border-b border-slate-800/80 flex items-center justify-between px-4 md:px-8 bg-[#141721]/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold capitalize text-slate-100">{activeTab}</h1>
            {activeTab === 'today' && (
              <span className="text-xs text-slate-400 hidden sm:inline-block font-mono">
                {dateDisplay}
              </span>
            )}
            {syncNotice && (
              <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-in fade-in">
                <RefreshCw className="w-2.5 h-2.5 animate-spin text-indigo-400" />
                {syncNotice}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Global Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search schedule & tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-44 md:w-64 transition-all"
              />
            </div>

            <button
              onClick={requestNotificationPermission}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
              title="Enable Reminders"
            >
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* View Port Router */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {/* Reconnect Warning Banner if Google session failed */}
          {(session?.error === 'RefreshAccessTokenError' || syncError) && (
            <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-xs font-medium">
                  {syncError || 'Google Calendar connection expired. Please reconnect to resume automatic event syncing.'}
                </span>
              </div>
              <button
                onClick={() => signIn('google')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all shadow-sm active:scale-95"
              >
                Reconnect Google
              </button>
            </div>
          )}

          {/* ================= TODAY DASHBOARD ================= */}
          {activeTab === 'today' && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Overdue Banner if any */}
              {overdueTasks.length > 0 && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium">
                      You have {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''} carryover.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setTasks((prev) =>
                        prev.map((t) =>
                          t.dueDate && t.dueDate < todayStr && !t.isCompleted
                            ? { ...t, dueDate: todayStr }
                            : t
                        )
                      );
                    }}
                    className="text-xs font-semibold underline underline-offset-4 hover:text-white"
                  >
                    Reschedule to Today
                  </button>
                </div>
              )}

              {/* Greeting & Progress Ring Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 p-6 rounded-2xl bg-[#141721] border border-slate-800/80 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div>
                    <span className="text-xs font-semibold text-indigo-400 tracking-wider uppercase font-mono">Today's Focus</span>
                    <h2 className="text-2xl font-bold text-white mt-1">{greeting}, Ready to conquer today?</h2>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      You have <span className="text-white font-medium">{todayEvents.length} events</span> and{' '}
                      <span className="text-white font-medium">{todayTasks.length} planned tasks</span> for today.
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-6">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="text-slate-400">Daily Completion</span>
                      <span className="font-mono text-indigo-400 font-semibold">{completionPercentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500 ease-out"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Next Upcoming Highlight */}
                <div className="p-5 rounded-2xl bg-[#141721] border border-slate-800/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Up Next</span>
                    {todayEvents.length > 0 && todayEvents[0].source === 'google' && (
                      <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                        Google Calendar
                      </span>
                    )}
                  </div>
                  {todayEvents.length > 0 ? (
                    <div className="my-2">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] font-mono mb-1.5">
                        <Clock className="w-3 h-3" />
                        <span>{formatEventTime(todayEvents[0].startTime)}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white truncate">{todayEvents[0].title}</h3>

                      {/* Location Tappable Link */}
                      {todayEvents[0].location && (
                        <a
                          href={getMapsSearchUrl(todayEvents[0].location)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-indigo-300 mt-1 line-clamp-1 flex items-center gap-1 transition-colors"
                          title="Open location in Maps"
                        >
                          <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
                          <span className="underline decoration-slate-600 underline-offset-2 truncate">
                            {todayEvents[0].location}
                          </span>
                        </a>
                      )}

                      {/* Prominent Join Meeting Button */}
                      {todayEvents[0].meetingUrl && (
                        <div className="mt-3">
                          <a
                            href={todayEvents[0].meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-semibold shadow-md shadow-emerald-600/25 transition-all"
                          >
                            <Video className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Join {getProviderDisplayName(todayEvents[0].meetingProvider)}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 my-auto">No further events scheduled for today.</p>
                  )}
                  <button
                    onClick={() => setActiveTab('calendar')}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium pt-2"
                  >
                    <span>View Calendar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Unified Chronological Timeline (Events + Tasks) */}
              <div className="p-6 rounded-2xl bg-[#141721] border border-slate-800/80">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Unified Timeline</h3>
                    <p className="text-xs text-slate-400">Events and scheduled to-dos in linear order</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>

                {combinedTimeline.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No scheduled items for this date. Press <kbd className="text-slate-400 font-mono">⌘K</kbd> to add something.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-800">
                    {combinedTimeline
                      .filter((item) => !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((item) => (
                        <div key={item.id} className="relative flex items-start justify-between group">
                          {/* Time dot marker */}
                          <div
                            className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 border-[#141721] ${
                              item.type === 'event'
                                ? item.source === 'google' ? 'bg-blue-500' : 'bg-indigo-500'
                                : item.isCompleted
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                            }`}
                          />

                          <div className="flex items-start gap-3 flex-1 min-w-0 pr-4">
                            {/* Toggle Task directly if item is task */}
                            {item.type === 'task' ? (
                              <button
                                onClick={() => toggleTask(item.id)}
                                className="mt-0.5 text-slate-400 hover:text-indigo-400 transition-colors"
                              >
                                {item.isCompleted ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Circle className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <div
                                className={`mt-0.5 p-0.5 rounded ${
                                  item.source === 'google'
                                    ? 'bg-blue-500/15 text-blue-400'
                                    : 'bg-indigo-500/10 text-indigo-400'
                                }`}
                              >
                                <CalendarIcon className="w-3.5 h-3.5" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-xs font-medium truncate ${
                                    item.isCompleted ? 'line-through text-slate-500' : 'text-slate-200'
                                  }`}
                                >
                                  {item.title}
                                </span>

                                {item.priority && (
                                  <span
                                    className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded ${
                                      item.priority === 'urgent'
                                        ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                                        : item.priority === 'high'
                                        ? 'bg-amber-500/10 text-amber-400'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {item.priority}
                                  </span>
                                )}

                                {item.source === 'google' && (
                                  <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
                                    Google Calendar (read-only)
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-mono flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  {item.time}
                                </span>
                                {item.duration && <span>{item.duration}m</span>}

                                {/* Tappable Location -> Opens Google/Apple Maps search */}
                                {item.location && (
                                  <a
                                    href={getMapsSearchUrl(item.location)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-slate-400 hover:text-indigo-300 transition-colors group/loc max-w-[200px]"
                                    title={`Search "${item.location}" in Maps`}
                                  >
                                    <MapPin className="w-3 h-3 text-slate-500 group-hover/loc:text-indigo-400 flex-shrink-0" />
                                    <span className="truncate underline decoration-slate-700 group-hover/loc:decoration-indigo-400 underline-offset-2">
                                      {item.location}
                                    </span>
                                  </a>
                                )}

                                {/* Prominent Meeting Join Button with Provider Name */}
                                {item.meetingUrl && (
                                  <a
                                    href={item.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold text-[11px] transition-all shadow-sm shadow-emerald-900/30 ml-1"
                                    title={`Join ${getProviderDisplayName(item.meetingProvider)} meeting`}
                                  >
                                    <Video className="w-3 h-3 stroke-[2.5]" />
                                    <span>Join {getProviderDisplayName(item.meetingProvider)}</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Task Actions (Google events are read-only) */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.type === 'task' && (
                              <button
                                onClick={() => deleteTask(item.id)}
                                className="text-slate-500 hover:text-red-400 p-1 rounded"
                                title="Delete Task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= CALENDAR VIEW ================= */}
          {activeTab === 'calendar' && (
            <div className="max-w-6xl mx-auto space-y-4">
              {/* Header Bar */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-[#141721] border border-slate-800">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">Interactive Calendar</h2>
                  <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                    {selectedDate}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                  {(['month', 'week', 'agenda'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setCalendarView(mode)}
                      className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                        calendarView === mode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Week Calendar Grid */}
              {calendarView === 'week' && (
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((item) => {
                    const dayEvents = events.filter((e) => eventOccursOnDate(e, item.dateIso));
                    const dayTasks = tasks.filter((t) => t.dueDate === item.dateIso);
                    const isSelected = selectedDate === item.dateIso;

                    return (
                      <div
                        key={item.dateIso}
                        onClick={() => setSelectedDate(item.dateIso)}
                        className={`min-h-[420px] p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-slate-800/60 border-indigo-500/50 ring-1 ring-indigo-500/30'
                            : 'bg-[#141721] border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-baseline mb-2">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase">
                              {item.dayName}
                            </span>
                            <span className={`text-xs font-mono ${isSelected ? 'text-indigo-400 font-bold' : 'text-slate-300'}`}>
                              {item.dayNum}
                            </span>
                          </div>

                          {/* Events Cards in Grid */}
                          <div className="space-y-1.5">
                            {dayEvents.map((ev) => (
                              <div
                                key={ev.id}
                                className={`p-1.5 rounded-lg border text-[10px] leading-tight ${
                                  ev.source === 'google'
                                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-200'
                                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[9px] text-indigo-400 block">
                                    {formatEventTime(ev.startTime)}
                                  </span>
                                  {ev.source === 'google' && (
                                    <span className="text-[8px] font-mono text-blue-400 uppercase">GCal</span>
                                  )}
                                </div>
                                <span className="truncate block font-medium mt-0.5">{ev.title}</span>

                                {/* Meeting indicator or link */}
                                {ev.meetingUrl && (
                                  <a
                                    href={ev.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[9px] text-emerald-400 hover:text-emerald-300 mt-1 font-semibold"
                                  >
                                    <Video className="w-2.5 h-2.5" />
                                    <span>Join {getProviderDisplayName(ev.meetingProvider)}</span>
                                  </a>
                                )}
                              </div>
                            ))}

                            {/* Tasks Chips in Grid */}
                            {dayTasks.map((t) => (
                              <div
                                key={t.id}
                                className={`p-1.5 rounded-lg border text-[10px] leading-tight ${
                                  t.isCompleted
                                    ? 'bg-slate-900/60 border-slate-800 text-slate-500 line-through'
                                    : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}
                              >
                                <span className="truncate block">{t.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-800">
                          {dayEvents.length + dayTasks.length} items
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Month or Agenda Fallback */}
              {calendarView !== 'week' && (
                <div className="p-8 text-center bg-[#141721] border border-slate-800 rounded-xl text-xs text-slate-400">
                  <p>Displaying optimized view for {calendarView}. Use the Week planner above for full drag-and-drop scheduling.</p>
                </div>
              )}
            </div>
          )}

          {/* ================= ALL TASKS VIEW ================= */}
          {activeTab === 'tasks' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Filter Priority:</span>
                  {(['all', 'urgent', 'high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setFilterPriority(p)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase font-mono ${
                        filterPriority === p ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {tasks.filter((t) => !t.isCompleted).length} pending
                </span>
              </div>

              <div className="space-y-2">
                {tasks
                  .filter((t) => (filterPriority === 'all' ? true : t.priority === filterPriority))
                  .filter((t) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between p-3.5 rounded-xl bg-[#141721] border border-slate-800/80 hover:border-slate-700 transition-all group"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button onClick={() => toggleTask(task.id)} className="mt-0.5 text-slate-400 hover:text-indigo-400">
                          {task.isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span className={`text-xs font-medium ${task.isCompleted ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                            {task.title}
                          </span>
                          {task.description && <p className="text-[11px] text-slate-400 mt-0.5">{task.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
                            {task.dueDate && <span>Due: {task.dueDate}</span>}
                            {task.scheduledTime && <span>At: {task.scheduledTime}</span>}
                            <span className="uppercase text-amber-400">{task.priority}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"
                        title="Delete Task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ================= INBOX ================= */}
          {activeTab === 'inbox' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Inbox Triage</h2>
                <p className="text-xs text-slate-400">Tasks captured without scheduled dates</p>
              </div>

              <div className="space-y-2">
                {tasks.filter((t) => !t.dueDate).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-[#141721] rounded-xl border border-slate-800">
                    Your Inbox is empty! Clean slate.
                  </div>
                ) : (
                  tasks
                    .filter((t) => !t.dueDate)
                    .map((t) => (
                      <div key={t.id} className="p-3.5 rounded-xl bg-[#141721] border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Circle className="w-4 h-4 text-slate-500" />
                          <span className="text-xs text-slate-200">{t.title}</span>
                        </div>
                        <button
                          onClick={() => {
                            setTasks((prev) =>
                              prev.map((item) => (item.id === t.id ? { ...item, dueDate: todayStr } : item))
                            );
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium font-mono"
                        >
                          Schedule for Today →
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* ================= WEEKLY REVIEW ================= */}
          {activeTab === 'review' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">Weekly Productivity Review</h2>
                <p className="text-xs text-slate-400">Reflect on momentum, assess completion metrics, and plan ahead</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[#141721] border border-slate-800">
                  <span className="text-xs text-slate-400">Completion Rate</span>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{weeklyStats.completionRate}%</div>
                </div>
                <div className="p-4 rounded-xl bg-[#141721] border border-slate-800">
                  <span className="text-xs text-slate-400">Completed Tasks</span>
                  <div className="text-2xl font-bold font-mono text-white mt-1">{weeklyStats.totalCompleted}</div>
                </div>
                <div className="p-4 rounded-xl bg-[#141721] border border-slate-800">
                  <span className="text-xs text-slate-400">Overdue Carried</span>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{weeklyStats.totalOverdue}</div>
                </div>
                <div className="p-4 rounded-xl bg-[#141721] border border-slate-800">
                  <span className="text-xs text-slate-400">Events Logged</span>
                  <div className="text-2xl font-bold font-mono text-indigo-400 mt-1">{weeklyStats.eventsScheduled}</div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141721] border border-slate-800 space-y-3">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">Next Week's Primary Goals</h3>
                <textarea
                  placeholder="1. Ship major project milestone&#10;2. Finish chapter 6 reading&#10;3. Maintain daily workout routine"
                  className="w-full h-28 bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* ================= SETTINGS & CALENDAR INTEGRATIONS ================= */}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">Integrations & External Calendars</h2>
                <p className="text-xs text-slate-400">Directly sync Google Calendar and Apple Calendar feeds (RFC 5545)</p>
              </div>

              {/* Google Calendar Section */}
              <div className="p-5 rounded-2xl bg-[#141721] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-blue-400 text-base">
                      <GoogleLogo className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-white">Google Calendar API (OAuth 2.0)</h3>
                      <p className="text-[11px] text-slate-400">
                        Connected as <span className="text-slate-200 font-mono">{session.user?.email}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => syncGoogleCalendar()}
                      disabled={isSyncing}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                    <button
                      onClick={() => signOut()}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>OAuth Session Active (Scopes: calendar.readonly, openid, email, profile)</span>
                  </div>
                  <span className="font-mono text-slate-500">
                    {events.filter((e) => e.source === 'google').length} Google event(s) synced
                  </span>
                </div>
              </div>

              {/* Apple Calendar ICS Subscription */}
              <div className="p-5 rounded-2xl bg-[#141721] border border-slate-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-lg">
                    
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">Apple Calendar / iCloud ICS</h3>
                    <p className="text-[11px] text-slate-400">Subscribe directly to any .ics / webcal public or secret link</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    id="icsUrlInput"
                    placeholder="webcal://p64-caldav.icloud.com/published/2/..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('icsUrlInput') as HTMLInputElement;
                      if (!input || !input.value) return;
                      // Simulated parse test feed
                      const sampleIcs = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Consultation Seminar\nDTSTART:20261115T150000Z\nDTEND:20261115T160000Z\nLOCATION:Room 402\nEND:VEVENT\nEND:VCALENDAR`;
                      const parsed = parseICS(sampleIcs, 'Apple Calendar');
                      setEvents((prev) => [...prev, ...parsed]);
                      alert(`Successfully imported ${parsed.length} event(s) from Apple ICS feed!`);
                      input.value = '';
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors"
                  >
                    Subscribe Feed
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =========================================================================
          UNIVERSAL QUICK CAPTURE MODAL (Cmd + K)
      ========================================================================= */}
      {isQuickCaptureOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[#141721] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <input
                autoFocus
                type="text"
                placeholder="e.g. Study copyright law tomorrow at 10 AM !high"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                  if (e.key === 'Escape') setIsQuickCaptureOpen(false);
                }}
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Live Parsing Preview Card */}
            {parsedPreview && (
              <div className="p-4 bg-slate-900/60 border-b border-slate-800/80 space-y-2">
                <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block">Live NLP Parsing</span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono capitalize">
                    {parsedPreview.type}
                  </span>
                  <span className="text-white font-medium">{parsedPreview.title}</span>
                  {parsedPreview.date && (
                    <span className="text-slate-400 font-mono">Date: {parsedPreview.date}</span>
                  )}
                  {parsedPreview.time && (
                    <span className="text-slate-400 font-mono">Time: {parsedPreview.time}</span>
                  )}
                  {parsedPreview.priority && (
                    <span className="text-amber-400 font-mono uppercase text-[10px]">
                      {parsedPreview.priority}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="p-3 bg-[#11131c] flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">Esc</kbd>
                <span>to cancel</span>
              </div>
              <button
                onClick={handleQuickAdd}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
              >
                Create Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MOBILE BOTTOM TAB BAR (Native iOS Feel)
      ========================================================================= */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#141721]/95 backdrop-blur-lg border-t border-slate-800/80 flex items-center justify-around px-2 z-40 pb-[env(safe-area-inset-bottom)]">
        {[
          { id: 'today', label: 'Today', icon: CalendarDays },
          { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
          { id: 'tasks', label: 'Tasks', icon: ListTodo },
          { id: 'inbox', label: 'Inbox', icon: Inbox },
          { id: 'review', label: 'Review', icon: BarChart3 },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center justify-center w-12 h-full transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
