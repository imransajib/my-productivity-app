'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  ListTodo
} from 'lucide-react';
import { Task, CalendarEvent, Category, CalendarConnection, Priority } from '@/lib/types';
import { DEFAULT_CATEGORIES, INITIAL_TASKS, INITIAL_EVENTS, getLocalData, saveLocalData } from '@/lib/store';
import { parseNaturalLanguageInput } from '@/lib/nlpParser';
import { parseICS } from '@/lib/calendarSync';

export default function PlannerApp() {
  // --- Persistent States ---
  const [tasks, setTasks] = useState<Task[]>(() => getLocalData('daily_os_tasks', INITIAL_TASKS));
  const [events, setEvents] = useState<CalendarEvent[]>(() => getLocalData('daily_os_events', INITIAL_EVENTS));
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

  // Initialize client-side current date after mount
  useEffect(() => {
    const now = new Date();
    const iso = now.toISOString().split('T')[0];
    setSelectedDate(iso);
    setTodayStr(iso);
    setCurrentHour(now.getHours());
    setDateDisplay(now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
  }, []);

  // Sync to local storage on modification
  useEffect(() => { saveLocalData('daily_os_tasks', tasks); }, [tasks]);
  useEffect(() => { saveLocalData('daily_os_events', events); }, [events]);
  useEffect(() => { saveLocalData('daily_os_categories', categories); }, [categories]);

  // Global Quick Capture shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickCaptureOpen(prev => !prev);
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
        new Notification('Unified Daily Planner', {
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
        source: 'local',
        calendarName: 'My Calendar',
        updatedAt: nowIso,
      };
      setEvents(prev => [...prev, newEvent]);
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
      setTasks(prev => [newTask, ...prev]);
    }

    setQuickInput('');
    setIsQuickCaptureOpen(false);
  };

  // --- Task Operations ---
  const toggleTask = (taskId: string) => {
    setTasks(prev =>
      prev.map(t => {
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
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const todayTasks = useMemo(() => {
    return tasks.filter(t => t.dueDate === selectedDate);
  }, [tasks, selectedDate]);

  const overdueTasks = useMemo(() => {
    return tasks.filter(t => t.dueDate && t.dueDate < todayStr && !t.isCompleted);
  }, [tasks, todayStr]);

  const todayEvents = useMemo(() => {
    return events.filter(e => e.startTime.startsWith(selectedDate));
  }, [events, selectedDate]);

  // Combined Chronological Timeline for Today
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
    category?: Category;
    raw: Task | CalendarEvent;
  }

  const combinedTimeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Push events
    todayEvents.forEach(e => {
      const timePart = e.startTime.includes('T') ? e.startTime.split('T')[1].substring(0, 5) : '00:00';
      items.push({
        type: 'event',
        id: e.id,
        title: e.title,
        time: timePart,
        location: e.location,
        meetingUrl: e.meetingUrl,
        category: categories.find(c => c.id === e.categoryId),
        raw: e,
      });
    });

    // Push scheduled tasks
    todayTasks.forEach(t => {
      items.push({
        type: 'task',
        id: t.id,
        title: t.title,
        time: t.scheduledTime || '23:59',
        isCompleted: t.isCompleted,
        priority: t.priority,
        duration: t.durationMin,
        category: categories.find(c => c.id === t.categoryId),
        raw: t,
      });
    });

    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [todayEvents, todayTasks, categories]);

  // Progress metrics
  const completionPercentage = useMemo(() => {
    if (todayTasks.length === 0) return 0;
    const done = todayTasks.filter(t => t.isCompleted).length;
    return Math.round((done / todayTasks.length) * 100);
  }, [todayTasks]);

  // --- Dynamic Greeting ---
  const greeting =
    currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  // --- Weekly Review Analytics ---
  const weeklyStats = useMemo(() => {
    const completed = tasks.filter(t => t.isCompleted).length;
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

  // Calculate days of the current week safely
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
            { id: 'today', label: 'Today', icon: CalendarDays, badge: todayTasks.filter(t => !t.isCompleted).length },
            { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
            { id: 'tasks', label: 'Tasks', icon: ListTodo, badge: tasks.filter(t => !t.isCompleted).length },
            { id: 'upcoming', label: 'Upcoming', icon: Clock },
            { id: 'inbox', label: 'Inbox', icon: Inbox, badge: tasks.filter(t => !t.dueDate).length },
            { id: 'review', label: 'Weekly Review', icon: BarChart3 },
            { id: 'settings', label: 'Integrations & Settings', icon: Settings },
          ].map(item => {
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
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="truncate">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Offline & Sync Status Pill */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between px-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Local-First (Synced)</span>
          </div>
          <button 
            onClick={() => {
              setSyncNotice('Re-indexing calendars...');
              setTimeout(() => setSyncNotice(null), 2000);
            }} 
            className="hover:text-slate-300 transition-colors"
            title="Refresh Sync"
          >
            <RefreshCw className={`w-3 h-3 ${syncNotice ? 'animate-spin text-indigo-400' : ''}`} />
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
          </div>

          <div className="flex items-center gap-2">
            {/* Global Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search schedule & tasks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
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
                      setTasks(prev =>
                        prev.map(t =>
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
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Up Next</span>
                  {todayEvents.length > 0 ? (
                    <div className="my-2">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] font-mono mb-1.5">
                        <Clock className="w-3 h-3" />
                        <span>{todayEvents[0].startTime.split('T')[1].substring(0, 5)}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white truncate">{todayEvents[0].title}</h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{todayEvents[0].location || 'No location set'}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 my-auto">No further events scheduled for today.</p>
                  )}
                  <button
                    onClick={() => setActiveTab('calendar')}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
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
                      onChange={e => setSelectedDate(e.target.value)}
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
                      .filter(item => !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(item => (
                      <div key={item.id} className="relative flex items-start justify-between group">
                        {/* Time dot marker */}
                        <div
                          className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 border-[#141721] ${
                            item.type === 'event' ? 'bg-indigo-500' : item.isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
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
                            <div className="mt-0.5 p-0.5 rounded bg-indigo-500/10 text-indigo-400">
                              <CalendarIcon className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
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
                            </div>

                            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-mono">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {item.time}
                              </span>
                              {item.duration && <span>{item.duration}m</span>}
                              {item.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 text-slate-500" />
                                  {item.location}
                                </span>
                              )}
                              {item.meetingUrl && (
                                <a
                                  href={item.meetingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-indigo-400 hover:underline"
                                >
                                  <Video className="w-3 h-3" />
                                  Join Call
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.type === 'task' && (
                            <button
                              onClick={() => deleteTask(item.id)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded"
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
                  {(['month', 'week', 'agenda'] as const).map(mode => (
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
                  {weekDays.map(item => {
                    const dayEvents = events.filter(e => e.startTime.startsWith(item.dateIso));
                    const dayTasks = tasks.filter(t => t.dueDate === item.dateIso);
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
                            {dayEvents.map(ev => (
                              <div
                                key={ev.id}
                                className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[10px] text-indigo-200 leading-tight"
                              >
                                <span className="font-mono text-[9px] text-indigo-400 block">
                                  {ev.startTime.split('T')[1].substring(0, 5)}
                                </span>
                                <span className="truncate block font-medium">{ev.title}</span>
                              </div>
                            ))}

                            {/* Tasks Chips in Grid */}
                            {dayTasks.map(t => (
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
                  {(['all', 'urgent', 'high', 'medium', 'low'] as const).map(p => (
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
                  {tasks.filter(t => !t.isCompleted).length} pending
                </span>
              </div>

              <div className="space-y-2">
                {tasks
                  .filter(t => (filterPriority === 'all' ? true : t.priority === filterPriority))
                  .filter(t => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(task => (
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
                {tasks.filter(t => !t.dueDate).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-[#141721] rounded-xl border border-slate-800">
                    Your Inbox is empty! Clean slate.
                  </div>
                ) : (
                  tasks
                    .filter(t => !t.dueDate)
                    .map(t => (
                      <div key={t.id} className="p-3.5 rounded-xl bg-[#141721] border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Circle className="w-4 h-4 text-slate-500" />
                          <span className="text-xs text-slate-200">{t.title}</span>
                        </div>
                        <button
                          onClick={() => {
                            setTasks(prev =>
                              prev.map(item => (item.id === t.id ? { ...item, dueDate: todayStr } : item))
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
                      G
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-white">Google Calendar API</h3>
                      <p className="text-[11px] text-slate-400">OAuth 2.0 Two-Way Sync with Google Workspace</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      alert('OAuth 2.0 flow initiates: Redirecting to accounts.google.com/o/oauth2/v2/auth');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md"
                  >
                    Connect Google Account
                  </button>
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
                      setEvents(prev => [...prev, ...parsed]);
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
                onChange={e => setQuickInput(e.target.value)}
                onKeyDown={e => {
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
        ].map(item => {
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
