'use client';

import { Sparkles, X } from 'lucide-react';
import { useAppUpdate } from '@/lib/useAppUpdate';

/** Floating "Update available" card shown when a newer release is deployed. */
export function UpdateBanner() {
  const { showBanner, remote, install, later, state } = useAppUpdate();
  if (!showBanner || !remote) return null;

  return (
    <div
      role="status"
      className="fixed z-[60] left-4 right-4 md:left-auto md:right-6 md:w-96 top-[calc(env(safe-area-inset-top)+12px)] rounded-2xl border border-indigo-500/30 bg-[#161a2b]/95 backdrop-blur-xl shadow-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <Sparkles className="w-4.5 h-4.5 text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Update available · v{remote.version}</p>
          {remote.notes?.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
              {remote.notes.slice(0, 3).map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={install}
              disabled={state === 'installing'}
              className="min-h-[40px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white disabled:opacity-60"
            >
              {state === 'installing' ? 'Updating…' : 'Update now'}
            </button>
            <button onClick={later} className="min-h-[40px] px-4 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800">
              Later
            </button>
          </div>
        </div>
        <button onClick={later} aria-label="Dismiss update" className="p-1 -m-1 text-slate-500 hover:text-slate-300">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
