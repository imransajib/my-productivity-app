'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { RefreshCw, Plus, LogOut, Unplug, AlertTriangle, Check } from 'lucide-react';
import {
  disconnectAppleCalendar,
  selectAppleCalendars,
  type AppleCalendarSyncResult,
  type GoogleCalendarItem,
} from '@/lib/calendarSync';
import { formatLastSynced, type SyncStatus } from '@/lib/useCalendarSync';

interface Props {
  userEmail: string | null | undefined;
  googleCalendars: GoogleCalendarItem[];
  selectedGoogleIds: string[];
  onToggleGoogleCalendar: (id: string) => void;
  apple: AppleCalendarSyncResult;
  status: SyncStatus;
  onSyncNow: () => void;
  onAddApple: () => void;
}

function StatusPill({ tone, label }: { tone: 'ok' | 'warn' | 'off'; label: string }) {
  const styles = {
    ok: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    warn: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    off: 'bg-slate-800 text-slate-400 border-slate-700',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${styles}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-slate-500'}`} />
      {label}
    </span>
  );
}

function Toggle({ checked, color, label, onChange }: { checked: boolean; color?: string; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="w-full flex items-center gap-3 min-h-[44px] px-3 rounded-xl hover:bg-slate-800/60 text-left"
    >
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color || '#6366f1' }} />
      <span className="flex-1 text-sm text-slate-200 truncate">{label}</span>
      <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-700'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

export function CalendarSettings({
  userEmail,
  googleCalendars,
  selectedGoogleIds,
  onToggleGoogleCalendar,
  apple,
  status,
  onSyncNow,
  onAddApple,
}: Props) {
  // local override until the next sync returns the saved selection
  const [appleOverride, setAppleOverride] = useState<string[] | null>(null);
  const appleSelected = appleOverride ?? apple.selectedCalendarUrls ?? [];
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  // refresh the "x min ago" label
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const toggleApple = async (url: string) => {
    const next = appleSelected.includes(url) ? appleSelected.filter((u) => u !== url) : [...appleSelected, url];
    if (next.length === 0) return; // keep at least one
    setAppleOverride(next);
    await selectAppleCalendars(next);
    onSyncNow();
  };

  const disconnectApple = async () => {
    setBusy(true);
    await disconnectAppleCalendar();
    setBusy(false);
    onSyncNow();
  };

  const googleTone = status.googleReconnect || status.googleError ? 'warn' : 'ok';
  const googleLabel = status.googleReconnect ? 'Needs reconnect' : status.googleError ? 'Error' : 'Connected';
  const appleTone = !apple.connected ? 'off' : status.appleError ? 'warn' : 'ok';
  const appleLabel = !apple.connected ? 'Not connected' : status.appleError ? 'Error' : 'Connected';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Sync header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Calendars</h2>
          <p className="text-sm text-slate-400">{formatLastSynced(status.lastSyncedAt)} · auto-syncs every 5 min</p>
        </div>
        <button
          onClick={onSyncNow}
          disabled={status.isSyncing}
          className="min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${status.isSyncing ? 'animate-spin' : ''}`} />
          {status.isSyncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {/* Google */}
      <section className="rounded-2xl bg-[#141721] border border-slate-800 overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">Google Calendar</h3>
            <p className="text-xs text-slate-400 truncate">{userEmail}</p>
          </div>
          <StatusPill tone={googleTone} label={googleLabel} />
        </div>
        {(status.googleReconnect || status.googleError) && (
          <div className="px-4 py-3 bg-amber-500/5 flex items-center gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{status.googleReconnect ? 'Google access expired.' : status.googleError}</span>
            <button onClick={() => signIn('google')} className="min-h-[36px] px-3 rounded-lg bg-amber-500/20 font-medium">
              Reconnect
            </button>
          </div>
        )}
        <div className="p-2">
          {googleCalendars.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">Calendars appear here after the first sync.</p>
          ) : (
            googleCalendars.map((cal) => (
              <Toggle
                key={cal.id}
                label={cal.summary + (cal.primary ? ' (primary)' : '')}
                color={cal.backgroundColor}
                checked={selectedGoogleIds.includes(cal.id)}
                onChange={() => onToggleGoogleCalendar(cal.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Apple */}
      <section className="rounded-2xl bg-[#141721] border border-slate-800 overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">Apple Calendar</h3>
            <p className="text-xs text-slate-400 truncate">
              {apple.connected
                ? apple.method === 'caldav'
                  ? `iCloud · ${apple.email ?? ''}`
                  : `Shared link · ${apple.name ?? apple.url ?? ''}`
                : 'iCloud account or a shared calendar link'}
            </p>
          </div>
          <StatusPill tone={appleTone} label={appleLabel} />
        </div>
        {status.appleError && apple.connected && (
          <div className="px-4 py-3 bg-amber-500/5 flex items-center gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{status.appleError}</span>
          </div>
        )}
        <div className="p-2">
          {apple.connected &&
            (apple.calendars ?? []).map((cal) => (
              <Toggle
                key={cal.url}
                label={cal.name}
                color={cal.color}
                checked={appleSelected.includes(cal.url)}
                onChange={() => toggleApple(cal.url)}
              />
            ))}
          <div className="flex flex-col sm:flex-row gap-2 p-2">
            <button
              onClick={onAddApple}
              className="flex-1 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-100 flex items-center justify-center gap-2"
            >
              {apple.connected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {apple.connected ? 'Change Apple connection' : 'Connect Apple Calendar'}
            </button>
            {apple.connected && (
              <button
                onClick={disconnectApple}
                disabled={busy}
                className="min-h-[44px] px-4 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Unplug className="w-4 h-4" /> Disconnect
              </button>
            )}
          </div>
        </div>
      </section>

      <button
        onClick={() => signOut()}
        className="w-full min-h-[44px] rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800/60 flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  );
}
