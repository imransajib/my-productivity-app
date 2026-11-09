'use client';

import React, { useRef, useEffect, useCallback } from 'react';

/** Formats an ISO timestamp to HH:mm */
export function formatEventTime(isoTime?: string): string {
  if (!isoTime) return '00:00';
  try {
    const d = new Date(isoTime);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  } catch {}
  if (isoTime.includes('T')) return isoTime.split('T')[1].substring(0, 5);
  return '00:00';
}

/** Returns true if the event occurs on the given YYYY-MM-DD date */
export function eventOccursOnDate(
  event: { startTime: string },
  targetDateIso: string
): boolean {
  if (event.startTime.startsWith(targetDateIso)) return true;
  try {
    const d = new Date(event.startTime);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}` === targetDateIso;
    }
  } catch {}
  return false;
}

/** Source badge colour map */
export function getSourceBadgeClass(source: string): string {
  if (source === 'google') return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (source === 'apple') return 'text-slate-300 bg-slate-700/50 border-slate-600/40';
  return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
}

export function getSourceLabel(source: string): string {
  if (source === 'google') return 'Google';
  if (source === 'apple') return 'Apple';
  if (source === 'local') return 'Local';
  return source;
}

// ─── Pull-to-Refresh hook ───────────────────────────────────────────────────

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 70 }: UsePullToRefreshOptions) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const onTouchEnd = useCallback(
    async (e: TouchEvent) => {
      if (!pulling.current) return;
      const delta = e.changedTouches[0].clientY - startY.current;
      if (delta > threshold) {
        await onRefresh();
      }
      pulling.current = false;
    },
    [onRefresh, threshold]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onTouchStart, onTouchEnd]);

  return containerRef;
}
