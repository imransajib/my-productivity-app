'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, SquarePlus, Check } from 'lucide-react';
import { APP_VERSION, BUILD_ID, useAppUpdate } from '@/lib/useAppUpdate';
import { CHANGELOG } from '@/lib/changelog';

/** Settings → App: version, check for updates, Home Screen install steps, what's new. */
export function AppInfoSettings() {
  const { state, remote, check, install } = useAppUpdate();
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values, read after mount
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true);
    setIsIOS(/iphone|ipad|ipod/i.test(nav.userAgent));
  }, []);

  const statusText =
    state === 'checking'
      ? 'Checking…'
      : state === 'available'
      ? `Version ${remote?.version} is ready`
      : state === 'current'
      ? 'You have the latest version'
      : state === 'error'
      ? "Couldn't check. Are you online?"
      : '';

  return (
    <section className="max-w-2xl mx-auto rounded-2xl bg-surface border border-line overflow-hidden">
      <div className="p-4 border-b border-line flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">App</h3>
          <p className="text-xs text-muted">
            Apex Planner v{APP_VERSION} <span className="text-subtle">({BUILD_ID})</span>
          </p>
        </div>
        {state === 'available' ? (
          <button
            onClick={install}
            className="min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Update
          </button>
        ) : (
          <button
            onClick={() => check(true)}
            disabled={state === 'checking'}
            className="min-h-[44px] px-4 rounded-xl bg-surface-2 hover:bg-surface-3 text-sm font-medium text-fg flex items-center gap-2 disabled:opacity-60"
          >
            {state === 'current' ? <Check className="w-4 h-4" /> : <RefreshCw className={`w-4 h-4 ${state === 'checking' ? 'animate-spin' : ''}`} />}
            Check for updates
          </button>
        )}
      </div>
      {statusText && <p className="px-4 pt-3 text-xs text-muted">{statusText}</p>}

      {!standalone && (
        <div className="m-4 p-4 rounded-xl bg-surface-2 border border-line">
          <p className="text-sm font-medium text-fg">Add to Home Screen</p>
          {isIOS ? (
            <ol className="mt-2 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                1. Tap <Share className="w-4 h-4 text-accent" /> <b>Share</b> in Safari&apos;s toolbar
              </li>
              <li className="flex items-center gap-2">
                2. Choose <SquarePlus className="w-4 h-4 text-accent" /> <b>Add to Home Screen</b>
              </li>
              <li>3. Tap <b>Add</b>. Apex opens full-screen like an app.</li>
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">
              In Chrome, open the ⋮ menu and choose <b>Install app</b> or <b>Add to Home screen</b>.
            </p>
          )}
        </div>
      )}

      <div className="p-4 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">What&apos;s new</p>
        {CHANGELOG.slice(0, 3).map((r) => (
          <div key={r.version} className="mb-3 last:mb-0">
            <p className="text-sm text-fg">
              v{r.version} <span className="text-subtle text-xs">· {r.date}</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {r.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
