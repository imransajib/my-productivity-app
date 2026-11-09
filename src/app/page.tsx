'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { BarChart3, Bell, CalendarDays, Home, ListTodo, Plus, RefreshCw, Settings, Sparkles, AlertTriangle } from 'lucide-react';
import type { CalendarEvent, Category, Task } from '@/lib/types';
import { DEFAULT_CATEGORIES, INITIAL_EVENTS, INITIAL_TASKS, getLocalData, saveLocalData, getUserEventStorageKey, getUserTaskStorageKey } from '@/lib/store';
import { useReminders, usePush } from '@/lib/useReminders';
import { computeReminderAt, reminderBody } from '@/lib/reminders';
import { useCalendarSync, formatLastSynced } from '@/lib/useCalendarSync';
import { useCloudState } from '@/lib/useCloudState';
import { useTheme } from '@/lib/useTheme';
import { relativeDayLabel, todayKey } from '@/lib/dates';
import { CalendarSettings } from '@/components/CalendarSettings';
import { AppInfoSettings } from '@/components/AppInfoSettings';
import { OnboardingModal } from '@/components/OnboardingModal';
import { CalendarView, type CalendarMode } from '@/components/planner/CalendarView';
import { AppearanceSettings, NotificationSettings, ReviewView, SignInCard, TasksView, TodayView } from '@/components/planner/views';
import { cx } from '@/components/planner/ui';
import { TaskComposer } from '@/components/planner/TaskComposer';

type Tab = 'today' | 'calendar' | 'tasks' | 'review' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'review', label: 'Review', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function PlannerApp() {
  const { data: session, status } = useSession();
  const userEmail = session?.user?.email ?? null;
  const taskStorageKey = useMemo(() => getUserTaskStorageKey(userEmail), [userEmail]);
  const eventStorageKey = useMemo(() => getUserEventStorageKey(userEmail), [userEmail]);
  const { theme, setTheme } = useTheme();

  // --- Data ---
  const [tasks, setTasks] = useState<Task[]>(() => getLocalData<Task[]>(taskStorageKey, INITIAL_TASKS));
  const [events, setEvents] = useState<CalendarEvent[]>(() => getLocalData<CalendarEvent[]>(eventStorageKey, INITIAL_EVENTS));
  const [categories, setCategories] = useState<Category[]>(() => getLocalData('daily_os_categories', DEFAULT_CATEGORIES));

  // --- UI ---
  const [tab, setTab] = useState<Tab>('today');
  const [selected, setSelected] = useState<string>(''); // set after mount (no clock reads during prerender)
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [composer, setComposer] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const openNew = useCallback(() => setComposer({ open: true, task: null }), []);
  const openEdit = useCallback((task: Task) => setComposer({ open: true, task }), []);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [greeting, setGreeting] = useState('Hello');

  useEffect(() => {
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client clock, after mount
    setGreeting(h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    setSelected(todayKey());
    try {
      const saved = localStorage.getItem('apex_calendar_mode') as CalendarMode | null;
      if (saved) setCalendarMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const changeCalendarMode = (m: CalendarMode) => {
    setCalendarMode(m);
    try {
      localStorage.setItem('apex_calendar_mode', m);
    } catch {
      /* ignore */
    }
  };

  // Reload per-user data when the account changes
  useEffect(() => {
    if (!userEmail) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- switch to this user's local copy
    setTasks(getLocalData<Task[]>(taskStorageKey, INITIAL_TASKS));
    setEvents(getLocalData<CalendarEvent[]>(eventStorageKey, INITIAL_EVENTS));
  }, [taskStorageKey, eventStorageKey, userEmail]);

  useEffect(() => saveLocalData(taskStorageKey, tasks), [taskStorageKey, tasks]);
  useEffect(() => saveLocalData(eventStorageKey, events), [eventStorageKey, events]);
  useEffect(() => saveLocalData('daily_os_categories', categories), [categories]);

  // --- Calendar sync (Google + Apple) ---
  const calendarSync = useCalendarSync(userEmail, status === 'authenticated');
  const { status: syncStatus, syncNow } = calendarSync;

  useEffect(() => {
    if (!syncStatus.lastSyncedAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- merge freshly synced remote events
    setEvents((prev) => [...prev.filter((e) => e.source !== 'google' && e.source !== 'apple'), ...calendarSync.syncedEvents]);
  }, [calendarSync.syncedEvents, syncStatus.lastSyncedAt]);

  // --- Account sync (tasks, local events, calendar choices) ---
  const cloud = useCloudState({
    email: userEmail,
    enabled: status === 'authenticated',
    tasks,
    setTasks,
    events,
    setEvents,
    categories,
    setCategories,
    prefs: calendarSync.googleSelection,
    onRemotePrefs: (p) => calendarSync.applyRemoteSelection(p.googleCalendarIds, p.updatedAt),
  });

  // --- Onboarding ---
  const onboardedKey = `apex_onboarded_${userEmail ?? 'anon'}`;
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  useEffect(() => {
    if (status !== 'authenticated' || !userEmail) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- first-run check after sign-in
      if (!localStorage.getItem(onboardedKey)) setOnboardingOpen(true);
    } catch {
      /* ignore */
    }
  }, [status, userEmail, onboardedKey]);
  const closeOnboarding = () => {
    try {
      localStorage.setItem(onboardedKey, '1');
    } catch {
      /* ignore */
    }
    setOnboardingOpen(false);
    syncNow();
  };

  // --- Keyboard: ⌘K quick add ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setComposer((c) => ({ open: !c.open, task: null }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Task actions ---
  const toggleTask = useCallback((id: string) => {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? now : undefined, updatedAt: now } : t))
    );
  }, []);
  const deleteTask = useCallback((id: string) => setTasks((prev) => prev.filter((t) => t.id !== id)), []);
  const moveOverdue = useCallback(() => {
    const today = todayKey();
    const now = new Date().toISOString();
    setTasks((prev) => prev.map((t) => (t.dueDate && t.dueDate < today && !t.isCompleted ? { ...t, dueDate: today, updatedAt: now } : t)));
  }, []);

  // --- Quick add ---
  const defaultDay = tab === 'today' || tab === 'calendar' ? selected : todayKey();
  const saveTask = useCallback((t: Task) => {
    setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]));
  }, []);
  const saveEvent = useCallback((e: CalendarEvent) => setEvents((prev) => [...prev, e]), []);

  // Keep reminder times right after any date/time change (e.g. "Move to today")
  useEffect(() => {
    const stale = tasks.filter((t) => (t.reminderAt ?? null) !== computeReminderAt(t));
    if (!stale.length) return;
    const now = new Date().toISOString();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived field repair, converges in one pass
    setTasks((prev) => prev.map((t) => (stale.some((x) => x.id === t.id) ? { ...t, reminderAt: computeReminderAt(t), updatedAt: now } : t)));
  }, [tasks]);

  // Reminders: in-app (while open) + push (when closed)
  const push = usePush(status === 'authenticated');
  useReminders(tasks, (t) => setToast({ title: t.title, body: reminderBody(t) }));
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Deep links from notifications: /?tab=tasks
  useEffect(() => {
    const go = (url: string) => {
      const t = new URL(url, location.origin).searchParams.get('tab') as Tab | null;
      if (t && TABS.some((x) => x.id === t)) setTab(t);
    };
    go(location.href);
    const onMsg = (e: MessageEvent) => e.data?.type === 'open' && go(e.data.url);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  // --- Gates ---
  if (status === 'loading' || (status === 'authenticated' && !selected)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center animate-pulse">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
      </div>
    );
  }
  if (status === 'unauthenticated' || !session) return <SignInCard onSignIn={() => signIn('google')} />;

  const openTasks = tasks.filter((t) => !t.isCompleted && t.dueDate && t.dueDate <= todayKey()).length;
  const syncProblem = syncStatus.googleReconnect || syncStatus.googleError;
  const tabTitle = TABS.find((t) => t.id === tab)?.label ?? '';

  return (
    <div className="min-h-dvh bg-bg">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-line bg-surface/70 backdrop-blur-xl p-4">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold text-fg">Apex Planner</span>
        </div>
        <button
          onClick={openNew}
          className="mt-5 min-h-[40px] px-3 rounded-xl bg-accent hover:bg-accent-strong text-white text-[14px] font-medium flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> New
          </span>
          <kbd className="text-[11px] text-white/70 font-sans">⌘K</kbd>
        </button>
        <nav className="mt-5 flex-1 space-y-0.5" aria-label="Main">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx(
                'w-full min-h-[38px] px-3 rounded-lg flex items-center gap-3 text-[14px] font-medium transition-colors',
                tab === id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
              )}
            >
              <Icon className="w-4.5 h-4.5" />
              <span className="flex-1 text-left">{label}</span>
              {id === 'tasks' && openTasks > 0 && <span className="text-[12px] tabular text-subtle">{openTasks}</span>}
            </button>
          ))}
        </nav>
        <button
          onClick={syncNow}
          className="mt-2 px-3 py-2 rounded-lg flex items-center gap-2 text-[12.5px] text-muted hover:bg-surface-2"
          title="Sync calendars now"
        >
          <RefreshCw className={cx('w-3.5 h-3.5', syncStatus.isSyncing && 'animate-spin')} />
          <span className="truncate">{syncStatus.isSyncing ? 'Syncing…' : formatLastSynced(syncStatus.lastSyncedAt)}</span>
        </button>
        <div className="mt-1 px-3 py-2 flex items-center gap-2.5 min-w-0">
          {session.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-surface-2" />
          )}
          <span className="text-[13px] text-fg truncate">{session.user?.name ?? userEmail}</span>
        </div>
      </aside>

      {/* ---------- Mobile header ---------- */}
      <header className="md:hidden sticky top-0 z-30 bg-glass backdrop-blur-xl border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-12 px-4 flex items-center justify-between">
          <span className="text-[17px] font-semibold text-fg">{tab === 'today' ? relativeDayLabel(selected) : tabTitle}</span>
          <button onClick={syncNow} aria-label="Sync now" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-muted active:bg-surface-2">
            <RefreshCw className={cx('w-4.5 h-4.5', syncStatus.isSyncing && 'animate-spin text-accent')} />
          </button>
        </div>
      </header>

      {/* ---------- Content ---------- */}
      <main className="md:pl-64">
        <div
          className={cx(
            'mx-auto px-4 pt-4 md:px-8 md:pt-8 pb-[calc(env(safe-area-inset-bottom)+112px)] md:pb-12',
            tab === 'calendar' ? 'max-w-6xl' : 'max-w-3xl'
          )}
        >
          {syncProblem && (
            <div className="mb-4 flex items-center gap-3 p-3.5 rounded-2xl bg-warning/10 border border-warning/25">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="flex-1 text-[14px] text-fg">{syncStatus.googleReconnect ? 'Google access expired.' : 'Calendar sync had a problem.'}</p>
              <button onClick={() => (syncStatus.googleReconnect ? signIn('google') : syncNow())} className="min-h-[36px] px-3 rounded-lg bg-surface border border-line text-[13px] font-medium text-fg">
                {syncStatus.googleReconnect ? 'Reconnect' : 'Retry'}
              </button>
            </div>
          )}

          {tab === 'today' && (
            <TodayView
              greeting={greeting}
              name={session.user?.name}
              day={selected}
              onSelectDay={setSelected}
              events={events}
              tasks={tasks}
              onToggleTask={toggleTask}
              onDeleteTask={deleteTask}
              onMoveOverdue={moveOverdue}
              onAdd={openNew}
              onEditTask={openEdit}
            />
          )}
          {tab === 'calendar' && (
            <CalendarView events={events} selected={selected} onSelect={setSelected} mode={calendarMode} onModeChange={changeCalendarMode} />
          )}
          {tab === 'tasks' && <TasksView tasks={tasks} onToggleTask={toggleTask} onDeleteTask={deleteTask} onAdd={openNew} onEditTask={openEdit} />}
          {tab === 'review' && <ReviewView tasks={tasks} events={events} />}
          {tab === 'settings' && (
            <div className="space-y-5">
              <h1 className="max-w-2xl mx-auto text-[28px] md:text-[32px] font-bold tracking-tight text-fg">Settings</h1>
              <AppearanceSettings theme={theme} onTheme={setTheme} />
              <NotificationSettings state={push.state} serverReminders={push.serverReminders} onEnable={push.enable} onDisable={push.disable} />
              <CalendarSettings
                userEmail={userEmail}
                googleCalendars={calendarSync.googleCalendars}
                selectedGoogleIds={calendarSync.selectedGoogleIds}
                onToggleGoogleCalendar={calendarSync.toggleGoogleCalendar}
                apple={calendarSync.apple}
                status={syncStatus}
                onSyncNow={syncNow}
                onAddApple={() => setOnboardingOpen(true)}
                cloudStatus={cloud.status}
              />
              <AppInfoSettings />
            </div>
          )}
        </div>
      </main>

      {/* ---------- Mobile: add button + tab bar ---------- */}
      {tab !== 'settings' && tab !== 'review' && (
        <button
          onClick={openNew}
          aria-label="Add task or event"
          className="md:hidden fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] w-14 h-14 rounded-full bg-accent text-white shadow-lg shadow-accent/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      )}
      <nav
        aria-label="Main"
        className="md:hidden fixed z-30 bottom-0 inset-x-0 bg-glass backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-[60px]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx('flex flex-col items-center justify-center gap-0.5 transition-colors', tab === id ? 'text-accent' : 'text-subtle')}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={tab === id ? 2.3 : 1.9} />
              <span className="text-[10.5px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ---------- New / edit ---------- */}
      <TaskComposer
        open={composer.open}
        task={composer.task}
        defaultDate={defaultDay}
        onClose={() => setComposer({ open: false, task: null })}
        onSaveTask={saveTask}
        onDeleteTask={deleteTask}
        onSaveEvent={saveEvent}
      />

      {toast && (
        <div
          role="alert"
          className="fixed z-[70] left-4 right-4 md:left-auto md:right-6 md:w-96 top-[calc(env(safe-area-inset-top)+12px)] p-4 rounded-2xl bg-surface border border-line shadow-2xl flex items-start gap-3 animate-pop-in"
        >
          <span className="w-9 h-9 shrink-0 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
            <Bell className="w-4.5 h-4.5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-fg truncate">{toast.title}</p>
            <p className="text-[13px] text-muted">{toast.body}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-[13px] font-medium text-accent min-h-[32px] px-2">
            OK
          </button>
        </div>
      )}

      <OnboardingModal
        isOpen={onboardingOpen}
        onClose={closeOnboarding}
        userEmail={userEmail}
        googleCalendars={calendarSync.googleCalendars}
        selectedGoogleCalendarIds={calendarSync.selectedGoogleIds}
        onToggleGoogleCalendar={calendarSync.toggleGoogleCalendar}
        appleStatus={calendarSync.apple}
        onAppleConnected={() => syncNow()}
      />
    </div>
  );
}
