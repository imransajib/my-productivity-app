'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CalendarEvent, Category, Task } from '@/lib/types';
import { isLocalEvent, mergeStates, type UserState } from '@/lib/stateMerge';

export type CloudStatus = 'off' | 'syncing' | 'synced' | 'offline';

interface Prefs {
  googleCalendarIds?: string[] | null;
  updatedAt?: string;
}

interface Options {
  email: string | null;
  enabled: boolean;
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  events: CalendarEvent[];
  setEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  categories: Category[];
  setCategories: Dispatch<SetStateAction<Category[]>>;
  prefs: Prefs;
  onRemotePrefs: (prefs: Prefs) => void;
}

interface Base {
  tasks: string[];
  events: string[];
}

const PUSH_DELAY_MS = 1500;
const RESUME_GAP_MS = 30 * 1000;

/**
 * Keeps tasks, local events, categories and calendar choices in sync with the
 * signed-in account (/api/state), so every device shows the same planner.
 * Deletions are detected by comparing with the last synced copy ("base").
 */
export function useCloudState(o: Options) {
  const [status, setStatus] = useState<CloudStatus>('off');
  const baseKey = `apex_cloud_base_${o.email ?? 'anon'}`;

  const latest = useRef(o);
  useEffect(() => {
    latest.current = o;
  });
  const lastSent = useRef('');
  const lastPull = useRef(0);
  const busy = useRef(false);
  const ready = useRef(false);

  const readBase = useCallback((): Base => {
    try {
      return JSON.parse(localStorage.getItem(baseKey) || '') as Base;
    } catch {
      return { tasks: [], events: [] };
    }
  }, [baseKey]);

  const fingerprint = (s: Pick<UserState, 'tasks' | 'events' | 'categories' | 'prefs'>) =>
    JSON.stringify([s.tasks, s.events, s.categories, s.prefs]);

  const buildLocal = useCallback((): UserState => {
    const { tasks, events, categories, prefs } = latest.current;
    const localEvents = events.filter(isLocalEvent);
    const base = readBase();
    const now = new Date().toISOString();
    const deleted: Record<string, string> = {};
    const taskIds = new Set(tasks.map((t) => t.id));
    const eventIds = new Set(localEvents.map((e) => e.id));
    for (const id of base.tasks ?? []) if (!taskIds.has(id)) deleted[id] = now;
    for (const id of base.events ?? []) if (!eventIds.has(id)) deleted[id] = now;
    return { tasks, events: localEvents, categories, prefs, deleted };
  }, [readBase]);

  const apply = useCallback(
    (merged: UserState) => {
      const cur = latest.current;
      if (JSON.stringify(merged.tasks) !== JSON.stringify(cur.tasks)) cur.setTasks(merged.tasks);
      const curLocal = cur.events.filter(isLocalEvent);
      if (JSON.stringify(merged.events) !== JSON.stringify(curLocal)) {
        cur.setEvents((prev) => [...prev.filter((e) => !isLocalEvent(e)), ...merged.events]);
      }
      if (merged.categories.length && JSON.stringify(merged.categories) !== JSON.stringify(cur.categories)) {
        cur.setCategories(merged.categories);
      }
      if ((merged.prefs?.updatedAt ?? '') > (cur.prefs?.updatedAt ?? '')) cur.onRemotePrefs(merged.prefs);
      try {
        localStorage.setItem(
          baseKey,
          JSON.stringify({ tasks: merged.tasks.map((t) => t.id), events: merged.events.map((e) => e.id) } satisfies Base)
        );
      } catch {
        /* ignore */
      }
      lastSent.current = fingerprint(merged);
    },
    [baseKey]
  );

  /** Pull the account copy, merge local changes into it, save the result. */
  const pull = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    lastPull.current = Date.now();
    setStatus('syncing');
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { enabled: boolean; state: UserState };
      if (!data.enabled) {
        setStatus('off');
        return;
      }
      const local = buildLocal();
      const merged = mergeStates(data.state, local);
      apply(merged);
      ready.current = true;
      if (fingerprint(merged) !== fingerprint(data.state) || Object.keys(local.deleted).length) {
        const put = await fetch('/api/state', { method: 'PUT', body: JSON.stringify(merged) });
        if (put.ok) apply(((await put.json()) as { state: UserState }).state);
      }
      setStatus('synced');
    } catch {
      setStatus('offline');
    } finally {
      busy.current = false;
    }
  }, [apply, buildLocal]);

  /** Send local edits. */
  const push = useCallback(async () => {
    if (busy.current || !ready.current) return;
    const local = buildLocal();
    if (fingerprint(local) === lastSent.current && !Object.keys(local.deleted).length) return;
    busy.current = true;
    setStatus('syncing');
    try {
      const res = await fetch('/api/state', { method: 'PUT', body: JSON.stringify(local) });
      if (!res.ok) throw new Error(String(res.status));
      apply(((await res.json()) as { state: UserState }).state);
      setStatus('synced');
    } catch {
      setStatus('offline');
    } finally {
      busy.current = false;
    }
  }, [apply, buildLocal]);

  // First sync + resume / reconnect
  useEffect(() => {
    if (!o.enabled || !o.email) return;
    ready.current = false;
    const first = window.setTimeout(pull, 300);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastPull.current > RESUME_GAP_MS) pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', pull);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', pull);
    };
  }, [o.enabled, o.email, pull]);

  // Push edits shortly after they happen
  const changeKey = fingerprint({
    tasks: o.tasks,
    events: o.events.filter(isLocalEvent),
    categories: o.categories,
    prefs: o.prefs,
  });
  useEffect(() => {
    if (!o.enabled || !ready.current || changeKey === lastSent.current) return;
    const t = window.setTimeout(push, PUSH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [changeKey, o.enabled, push]);

  return { status, syncNow: pull };
}
