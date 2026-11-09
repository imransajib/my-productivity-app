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
    <section className="max-w-2xl mx-auto mt-5 rounded-2xl bg-[#141721] border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">App</h3>
          <p className="text-xs text-slate-400">
            Apex Planner v{APP_VERSION} <span className="text-slate-600">({BUILD_ID})</span>
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
            className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-100 flex items-center gap-2 disabled:opacity-60"
          >
            {state === 'current' ? <Check className="w-4 h-4" /> : <RefreshCw className={`w-4 h-4 ${state === 'checking' ? 'animate-spin' : ''}`} />}
            Check for updates
          </button>
        )}
      </div>
      {statusText && <p className="px-4 pt-3 text-xs text-slate-400">{statusText}</p>}

      {!standalone && (
        <div className="m-4 p-4 rounded-xl bg-slate-900/70 border border-slate-800">
          <p className="text-sm font-medium text-white">Add to Home Screen</p>
          {isIOS ? (
            <ol className="mt-2 space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                1. Tap <Share className="w-4 h-4 text-indigo-300" /> <b>Share</b> in Safari&apos;s toolbar
              </li>
              <li className="flex items-center gap-2">
                2. Choose <SquarePlus className="w-4 h-4 text-indigo-300" /> <b>Add to Home Screen</b>
              </li>
              <li>3. Tap <b>Add</b>. Apex opens full-screen like an app.</li>
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-300">
              In Chrome, open the ⋮ menu and choose <b>Install app</b> or <b>Add to Home screen</b>.
            </p>
          )}
        </div>
      )}

      <div className="p-4 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">What&apos;s new</p>
        {CHANGELOG.slice(0, 3).map((r) => (
          <div key={r.version} className="mb-3 last:mb-0">
            <p className="text-sm text-slate-200">
              v{r.version} <span className="text-slate-500 text-xs">· {r.date}</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
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
