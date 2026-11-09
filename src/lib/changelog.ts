// Newest first. Add an entry (and bump package.json "version") for every release
// so installed apps can show "What's new" in the update card.
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  notes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '0.7.0',
    date: '2026-11-09',
    notes: [
      'Edit or delete events you created in Apex',
      'Undo after deleting a task or event',
      'Open Google events in Google Calendar with one tap',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-09',
    notes: [
      'Tasks: pick a date and time, tap a task to edit it',
      'Reminders: at the time, 10/30 min, 1 hour or 1 day before',
      'Turn on reminders in Settings to get notifications',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-09',
    notes: [
      'Redesigned for phones: new Today screen, tab bar and quick add',
      'Calendar: Day, Week and Month views (month now works)',
      'Each event is its own card: tap the chevron for location, Join link and notes',
      'Light and dark mode in Settings → Appearance',
    ],
  },
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
