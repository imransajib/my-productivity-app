'use client';

import { useEffect } from 'react';

/** Registers the Apex Planner service worker for offline app-shell caching. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }
  }, []);

  return null;
}
