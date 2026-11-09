'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { reminderBody } from '@/lib/reminders';

/* ---------------- Push permission + subscription ---------------- */

export type PushState = 'loading' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied' | 'error';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function postSubscription(sub: PushSubscription, test: boolean) {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), test }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { serverReminders: boolean };
}

export function usePush(enabled: boolean) {
  const [state, setState] = useState<PushState>('loading');
  const [serverReminders, setServerReminders] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) {
        setState(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
        return;
      }
      if (Notification.permission === 'denied') return setState('denied');
      if (Notification.permission !== 'granted') return setState('off');
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return setState('off');
        const r = await postSubscription(sub, false); // keep the account's copy fresh
        setServerReminders(r.serverReminders);
        setState('on');
      } catch {
        setState('off');
      }
    })();
  }, [enabled]);

  const enable = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      if (!key) return setState('error');
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const r = await postSubscription(sub, true);
      setServerReminders(r.serverReminders);
      setState('on');
    } catch (err) {
      console.error(err);
      setState('error');
    }
  }, []);

  const disable = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } finally {
      setState('off');
    }
  }, []);

  return { state, serverReminders, enable, disable };
}

/* ---------------- In-app reminders (while the app is open) ---------------- */

const FIRED_KEY = 'apex_reminders_fired';
const WINDOW_MS = 24 * 60 * 60 * 1000;

function readFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Fires reminders due while the app is open (and ones missed in the last 10 minutes).
 * Uses the same notification tag as server pushes, so a device never shows both.
 */
export function useReminders(tasks: Task[], onRemind: (task: Task) => void) {
  const cb = useRef(onRemind);
  useEffect(() => {
    cb.current = onRemind;
  });

  useEffect(() => {
    const now = Date.now();
    const fired = readFired();
    const timers: number[] = [];

    const fire = async (task: Task) => {
      const key = `${task.id}|${task.reminderAt}`;
      const f = readFired();
      if (f[key]) return;
      f[key] = Date.now();
      // keep the list small
      for (const [k, t] of Object.entries(f)) if (Date.now() - t > 3 * WINDOW_MS) delete f[k];
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify(f));
      } catch {
        /* ignore */
      }
      cb.current(task);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.showNotification(task.title, {
            body: reminderBody(task),
            tag: `task-${task.id}`,
            icon: '/icon-192.png',
            data: { url: '/?tab=tasks' },
          });
        } catch {
          /* in-app toast already shown */
        }
      }
    };

    for (const t of tasks) {
      if (t.isCompleted || !t.reminderAt) continue;
      const at = Date.parse(t.reminderAt);
      if (!at || fired[`${t.id}|${t.reminderAt}`]) continue;
      const delay = at - now;
      if (delay < -10 * 60 * 1000 || delay > WINDOW_MS) continue;
      timers.push(window.setTimeout(() => fire(t), Math.max(0, delay)));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [tasks]);
}
