'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const RESUME_GAP_MS = 60 * 1000;
const HIDE_KEY = 'apex_update_hidden';

export interface RemoteVersion {
  version: string;
  build: string;
  notes: string[];
  date?: string;
}

export type UpdateState = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'error';

/**
 * Detects a newer deployment by comparing this bundle's build id with /api/version,
 * and installs it by refreshing the service worker and reloading.
 */
export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>('idle');
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [hiddenBuild, setHiddenBuild] = useState<string | null>(null);
  const lastCheck = useRef(0);

  const check = useCallback(async (manual = false) => {
    lastCheck.current = Date.now();
    if (manual) setState('checking');
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as RemoteVersion;
      setRemote(data);
      setState(data.build && data.build !== BUILD_ID ? 'available' : 'current');
    } catch {
      if (manual) setState('error');
    }
  }, []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
      setHiddenBuild(localStorage.getItem(HIDE_KEY));
    } catch {
      /* storage blocked */
    }
    // Clean the ?u= marker added by install()
    const url = new URL(window.location.href);
    if (url.searchParams.has('u')) {
      url.searchParams.delete('u');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    const first = window.setTimeout(() => check(), 3000);
    const timer = window.setInterval(() => check(), CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RESUME_GAP_MS) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const install = useCallback(async () => {
    setState('installing');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        // iOS can hang on update(); don't wait more than 4 s
        await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 4000))]);
        reg.waiting?.postMessage('skipWaiting');
      }
    } catch {
      /* reload anyway */
    }
    window.location.replace(`/?u=${remote?.build ?? Date.now()}`);
  }, [remote]);

  const later = useCallback(() => {
    if (!remote) return;
    setHiddenBuild(remote.build);
    try {
      localStorage.setItem(HIDE_KEY, remote.build);
    } catch {
      /* ignore */
    }
  }, [remote]);

  return {
    state,
    remote,
    check,
    install,
    later,
    showBanner: state === 'available' && remote?.build !== hiddenBuild,
  };
}
