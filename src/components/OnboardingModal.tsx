'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { GoogleCalendarItem, AppleCalendarSyncResult, connectAppleCalendar } from '@/lib/calendarSync';

function GoogleLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function AppleLogo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 170 170" fill="currentColor">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-5.77-8.91-10.45-19.12-14.05-30.63-3.6-11.51-5.4-22.39-5.4-32.64 0-14.67 3.73-26.79 11.19-36.35 7.46-9.56 16.78-14.42 27.96-14.59 4.9 0 10.11 1.25 15.65 3.76 5.54 2.51 9.4 3.82 11.59 3.94 1.95-.12 6.04-1.5 12.28-4.14 6.24-2.65 11.69-3.87 16.36-3.68 12.3.65 22.09 4.8 29.37 12.45-10.89 6.58-16.22 15.71-16 27.38.22 9.02 3.65 16.59 10.29 22.7 6.64 6.12 14.52 9.53 23.63 10.23-2.17 6.42-4.8 12.87-7.89 19.34zM119.22 31.84c0-7.29 2.58-14.1 7.74-20.44 5.16-6.34 11.59-10.42 19.29-12.24.22 1.3.33 2.45.33 3.44 0 7.18-2.69 14.05-8.08 20.61-5.38 6.56-11.83 10.45-19.34 11.67-.11-1.09-.16-2.09-.16-3.04z" />
    </svg>
  );
}

export interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  googleCalendars: GoogleCalendarItem[];
  selectedGoogleCalendarIds: string[];
  onToggleGoogleCalendar: (calendarId: string) => void;
  appleStatus: AppleCalendarSyncResult;
  onAppleConnected: () => void;
}

export function OnboardingModal({
  isOpen,
  onClose,
  userEmail,
  googleCalendars,
  selectedGoogleCalendarIds,
  onToggleGoogleCalendar,
  appleStatus,
  onAppleConnected,
}: OnboardingModalProps) {
  const [appleMethod, setAppleMethod] = useState<'caldav' | 'ics'>('caldav');
  const [appleEmail, setAppleEmail] = useState('');
  const [applePassword, setApplePassword] = useState('');
  const [appleIcsUrl, setAppleIcsUrl] = useState('');
  const [isSubmittingApple, setIsSubmittingApple] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnectApple = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppleError(null);
    setIsSubmittingApple(true);

    try {
      if (appleMethod === 'caldav') {
        if (!appleEmail || !applePassword) {
          setAppleError('Please provide both your Apple ID email and app-specific password.');
          setIsSubmittingApple(false);
          return;
        }

        const res = await connectAppleCalendar({
          method: 'caldav',
          email: appleEmail,
          password: applePassword,
        });

        if (!res.success) {
          setAppleError(res.error || 'Failed to authenticate with iCloud CalDAV');
        } else {
          onAppleConnected();
        }
      } else {
        if (!appleIcsUrl) {
          setAppleError('Please enter a valid webcal:// or https:// calendar URL.');
          setIsSubmittingApple(false);
          return;
        }

        const res = await connectAppleCalendar({
          method: 'ics',
          url: appleIcsUrl,
        });

        if (!res.success) {
          setAppleError(res.error || 'Failed to connect to shared calendar link');
        } else {
          onAppleConnected();
        }
      }
    } catch (err: any) {
      setAppleError(err?.message || 'Error communicating with server');
    } finally {
      setIsSubmittingApple(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#141721] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Connect your calendars</h2>
            <span className="text-xs text-indigo-400 font-mono">Unified Daily Timeline Setup</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-1 mb-6 leading-relaxed">
          Apex Planner brings your daily schedule together across Google and Apple calendars with instant offline rendering and local-first privacy.
        </p>

        <div className="space-y-6">
          {/* ================= GOOGLE CALENDAR CARD ================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <GoogleLogo className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">Google Calendar</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                    {userEmail || 'Active account'}
                  </span>
                </div>
              </div>
            </div>

            {/* Calendar Picker */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] font-medium text-slate-300 block mb-2">
                Choose Google calendars to include:
              </span>
              {googleCalendars.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic py-1">
                  Loading discovered Google calendars...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {googleCalendars.map((cal) => {
                    const isChecked = selectedGoogleCalendarIds.includes(cal.id);
                    return (
                      <label
                        key={cal.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-slate-800/80 border-indigo-500/40 text-slate-200'
                            : 'bg-slate-950/40 border-slate-800/60 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleGoogleCalendar(cal.id)}
                          className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cal.backgroundColor || '#4285F4' }}
                        />
                        <span className="truncate">{cal.summary}</span>
                        {cal.primary && (
                          <span className="text-[9px] font-mono text-slate-500 uppercase ml-auto">
                            Primary
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ================= APPLE CALENDAR CARD ================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
                  <AppleLogo className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">Apple Calendar (iCloud)</span>
                    {appleStatus.connected ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700">
                        Not connected
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Sync iCloud calendars via CalDAV or subscribe to public shared feeds
                  </span>
                </div>
              </div>
            </div>

            {appleStatus.connected ? (
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-300 flex items-center justify-between">
                <span>
                  iCloud sync active ({appleStatus.method === 'caldav' ? appleStatus.email || 'CalDAV' : 'Shared Link'}).
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  {appleStatus.calendars?.length ?? 1} calendar(s) available
                </span>
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                {/* Connection Method Selector */}
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAppleMethod('caldav');
                      setAppleError(null);
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all ${
                      appleMethod === 'caldav'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    iCloud CalDAV (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAppleMethod('ics');
                      setAppleError(null);
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all ${
                      appleMethod === 'ics'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Public / Shared Link (.ics)
                  </button>
                </div>

                {/* CalDAV Form */}
                {appleMethod === 'caldav' ? (
                  <form onSubmit={handleConnectApple} className="space-y-3">
                    {/* Instructions Banner */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 space-y-1.5">
                      <div className="flex items-center justify-between font-semibold text-slate-200">
                        <span>Apple ID App-Specific Password</span>
                        <a
                          href="https://account.apple.com/account/manage"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono text-[10px]"
                        >
                          <span>account.apple.com</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Apple does not support OAuth for third-party calendars. Generate a secure app password:
                      </p>
                      <ol className="list-decimal list-inside text-slate-400 space-y-0.5 pl-1">
                        <li>Sign in to <span className="text-slate-200">account.apple.com</span></li>
                        <li>Navigate to <span className="text-slate-200">Sign-In and Security</span> → <span className="text-slate-200">App-Specific Passwords</span></li>
                        <li>Create a password for <span className="text-slate-200">Apex Planner</span> and paste it below.</li>
                      </ol>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-400 mb-1 block">Apple ID Email</label>
                        <input
                          type="email"
                          required
                          value={appleEmail}
                          onChange={(e) => setAppleEmail(e.target.value)}
                          placeholder="name@icloud.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-400 mb-1 block">App-Specific Password</label>
                        <input
                          type="password"
                          required
                          value={applePassword}
                          onChange={(e) => setApplePassword(e.target.value)}
                          placeholder="xxxx-xxxx-xxxx-xxxx"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    {appleError && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-950/30 border border-red-800/40 text-red-300 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{appleError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingApple}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSubmittingApple ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting iCloud...</span>
                        </>
                      ) : (
                        <span>Connect iCloud CalDAV</span>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Shared Link Form */
                  <form onSubmit={handleConnectApple} className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                      <span className="font-semibold text-slate-200 block">Public iCloud Calendar Share</span>
                      <p>
                        In Apple Calendar on macOS or iOS: click the calendar share icon → turn on <span className="text-slate-200">Public Calendar</span> → copy the link.
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-mono text-slate-400 mb-1 block">Webcal / ICS URL</label>
                      <input
                        type="text"
                        required
                        value={appleIcsUrl}
                        onChange={(e) => setAppleIcsUrl(e.target.value)}
                        placeholder="webcal://p64-caldav.icloud.com/published/2/..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {appleError && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-950/30 border border-red-800/40 text-red-300 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{appleError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingApple}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSubmittingApple ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Validating Calendar Link...</span>
                        </>
                      ) : (
                        <span>Connect Shared Calendar</span>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Skip for now
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-2"
          >
            <span>Continue to Planner</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
