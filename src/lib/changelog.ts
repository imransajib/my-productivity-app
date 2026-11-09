// Newest first. Add an entry (and bump package.json "version") for every release
// so installed apps can show "What's new" in the update card.
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  notes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '0.4.0',
    date: '2026-11-09',
    notes: [
      'Your Apple Calendar connection now follows your account to every device',
      'Tasks, events and calendar choices sync between phone and computer',
      'Sync status shown in Settings → Calendars',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-09',
    notes: [
      'Google + Apple Calendar sync with meeting links and locations',
      'Calendars settings: choose calendars, sync now, reconnect',
      'Install on your Home Screen, with in-app updates',
    ],
  },
];

export const LATEST = CHANGELOG[0];
