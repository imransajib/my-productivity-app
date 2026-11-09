'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/types';
import {
  syncAllCalendars,
  type AppleCalendarSyncResult,
  type GoogleCalendarItem,
} from '@/lib/calendarSync';

const AUTO_SYNC_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000; // ignore focus events that fire right after a sync

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  googleError: string | null;
  googleReconnect: boolean;
  appleError: string | null;
}

interface CachedSync {
  events: CalendarEvent[];
  googleCalendars: GoogleCalendarItem[];
  apple: AppleCalendarSyncResult;
  syncedAt: string;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: cache is optional */
  }
}

function syncRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString(),
  };
}

/**
 * Google + Apple calendar sync engine.
 * - renders cached events instantly, then refreshes
 * - syncs on sign-in, on window focus / tab visible, every 5 min while visible, and on demand
 * - remembers which Google calendars the user picked, per user
 */
export function useCalendarSync(userEmail: string | null, enabled: boolean) {
  const ns = userEmail ?? 'anon';
  const cacheKey = `apex_sync_cache_${ns}`;
  const selectionKey = `apex_google_calendars_${ns}`;

  const [syncedEvents, setSyncedEvents] = useState<CalendarEvent[]>([]);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarItem[]>([]);
  const [selectedGoogleIds, setSelectedGoogleIds] = useState<string[] | null>(null);
  const [selectionUpdatedAt, setSelectionUpdatedAt] = useState<string | undefined>(undefined);
  const [apple, setApple] = useState<AppleCalendarSyncResult>({ events: [], connected: false });
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncedAt: null,
    googleError: null,
    googleReconnect: false,
    appleError: null,
  });

  const inFlight = useRef(false);
  const lastRun = useRef(0);
  const selectedRef = useRef<string[] | null>(null);
  useEffect(() => {
    selectedRef.current = selectedGoogleIds;
  }, [selectedGoogleIds]);

  // Hydrate from cache when the user changes
  useEffect(() => {
    if (!userEmail) return;
    const cached = readJSON<CachedSync | null>(cacheKey, null);
    // Hydrating from localStorage is an external-store read; it must run after mount.
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncedEvents(cached.events);
      setGoogleCalendars(cached.googleCalendars);
      setApple(cached.apple);
      setStatus((s) => ({ ...s, lastSyncedAt: cached.syncedAt }));
    }
    setSelectedGoogleIds(readJSON<string[] | null>(selectionKey, null));
    setSelectionUpdatedAt(readJSON<string | undefined>(`${selectionKey}_at`, undefined));
  }, [userEmail, cacheKey, selectionKey]);

  const syncNow = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    lastRun.current = Date.now();
    setStatus((s) => ({ ...s, isSyncing: true }));
    try {
      const result = await syncAllCalendars({
        ...syncRange(),
        googleCalendarIds: selectedRef.current ?? undefined,
      });
      const calendars = result.google.calendars ?? [];
      setSyncedEvents(result.events);
      if (calendars.length) setGoogleCalendars(calendars);
      setApple(result.apple);
      setStatus({
        isSyncing: false,
        lastSyncedAt: result.syncedAt,
        googleError: result.google.error ?? null,
        googleReconnect: Boolean(result.google.reconnectRequired),
        appleError: result.apple.connected ? result.apple.error ?? null : null,
      });
      writeJSON(cacheKey, {
        events: result.events,
        googleCalendars: calendars,
        apple: { ...result.apple, events: [] },
        syncedAt: result.syncedAt,
      } satisfies CachedSync);
    } catch {
      setStatus((s) => ({ ...s, isSyncing: false, googleError: 'Sync failed. Check your connection.' }));
    } finally {
      inFlight.current = false;
    }
  }, [enabled, cacheKey]);

  // Initial sync + focus/visibility + interval
  useEffect(() => {
    if (!enabled) return;
    syncNow();

    const maybeSync = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > MIN_GAP_MS) {
        syncNow();
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') syncNow();
    }, AUTO_SYNC_MS);

    window.addEventListener('focus', maybeSync);
    document.addEventListener('visibilitychange', maybeSync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', maybeSync);
      document.removeEventListener('visibilitychange', maybeSync);
    };
  }, [enabled, syncNow]);

  const toggleGoogleCalendar = useCallback(
    (id: string) => {
      const current =
        selectedRef.current ??
        googleCalendars.filter((c) => c.selected !== false).map((c) => c.id);
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      const at = new Date().toISOString();
      selectedRef.current = next;
      setSelectedGoogleIds(next);
      setSelectionUpdatedAt(at);
      writeJSON(selectionKey, next);
      writeJSON(`${selectionKey}_at`, at);
      syncNow();
    },
    [googleCalendars, selectionKey, syncNow]
  );

  /** Apply a calendar choice made on another device. */
  const applyRemoteSelection = useCallback(
    (ids: string[] | null | undefined, at: string | undefined) => {
      selectedRef.current = ids ?? null;
      setSelectedGoogleIds(ids ?? null);
      setSelectionUpdatedAt(at);
      writeJSON(selectionKey, ids ?? null);
      writeJSON(`${selectionKey}_at`, at);
      syncNow();
    },
    [selectionKey, syncNow]
  );

  const effectiveSelectedGoogleIds =
    selectedGoogleIds ?? googleCalendars.filter((c) => c.selected !== false).map((c) => c.id);

  return {
    syncedEvents,
    googleCalendars,
    selectedGoogleIds: effectiveSelectedGoogleIds,
    toggleGoogleCalendar,
    googleSelection: { googleCalendarIds: selectedGoogleIds, updatedAt: selectionUpdatedAt },
    applyRemoteSelection,
    apple,
    status,
    syncNow,
  };
}

/** "just now", "4 min ago", "2 h ago" */
export function formatLastSynced(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Not synced yet';
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Synced ${hours} h ago`;
  return `Synced ${new Date(iso).toLocaleDateString()}`;
}
