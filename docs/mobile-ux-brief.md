You are continuing work on "Apex Planner" (Next.js 16 App Router, React 19, Tailwind v4, TS) in this folder. Read AGENTS.md (breaking changes; check node_modules/next/dist/docs/ for metadata/viewport/manifest APIs). Google + Apple calendar sync and sign-in already exist; do not break them. Read src/app/page.tsx and the components first.

PHASE 3 GOAL: make it feel like a native mobile app (iPhone first), while keeping the desktop layout.

1. Split the large src/app/page.tsx into components under src/components/ (Timeline, EventCard, TaskItem, TaskComposer, CalendarSettings, BottomNav, etc.) so it is maintainable.
2. Mobile layout (< 768px):
   - Fixed bottom tab bar (Today, Calendar, Tasks/Inbox, Settings) with icons + labels, safe-area padding (env(safe-area-inset-bottom)), 44px+ touch targets.
   - Compact sticky header with greeting, date and a horizontally swipeable week strip for picking the day.
   - Timeline as full-width cards; event card shows time, title, location (tap opens maps) and a large "Join" button when there is a meeting link. Upcoming/now indicator line.
   - Floating "+" button opening a bottom sheet for quick add (natural-language input already exists in src/lib/nlpParser.ts) instead of a modal; sheet closes by drag-down or backdrop tap.
   - Pull-to-refresh on the Today/Calendar views triggers calendar sync.
   - Swipe a task right to complete, left to delete (with undo toast).
   - No horizontal scrolling anywhere; inputs at least 16px font so iOS does not zoom.
3. PWA: app manifest (src/app/manifest.ts) with name "Apex Planner", standalone display, theme/background matching the dark UI, icons (generate simple SVG/PNG icons in public/ — an SVG icon plus 192/512 PNG references; if you cannot create PNGs, create SVG icons and reference them), apple-touch-icon, viewport with viewport-fit=cover and themeColor, appleWebApp metadata (capable, black-translucent status bar). Add a minimal service worker (public/sw.js) that caches the app shell for offline use, registered from a small client component.
4. Polish: loading skeletons while syncing, empty states, respect prefers-reduced-motion, accessible labels on icon buttons.
5. Rules: Shell: you may ONLY run read-only commands (cd, ls, cat, head, tail, find, grep, sort, sed -n, git status/diff/log/show) plus `npx tsc --noEmit` and `npm run build`; anything else aborts your run. Do not add packages. Do not edit .env.local or touch files outside this folder. Write code so `npm run build` and `npx tsc --noEmit` pass; run both yourself and keep fixing until they pass. Finish with a short summary.

ALSO FINISH THESE PHASE 2 GAPS (the server side exists; the UI is not wired):
- src/components/OnboardingModal.tsx exists but page.tsx never renders it. Show it after first sign-in (persist "onboarded" per user email in localStorage) — on mobile as a full-screen step flow: 1) Google connected + calendar picker, 2) Connect Apple (CalDAV or .ics link), 3) Done -> first sync.
- page.tsx only fetches Google. Use syncAllCalendars from src/lib/calendarSync.ts so Apple events are merged + de-duplicated into the timeline/calendar.
- Sync engine: sync on load, on window focus/visibilitychange, every 5 minutes while visible, plus a "Sync now" button (spinner) and "Last synced X min ago" label. Cache last result in localStorage per user email for instant render.
- A "Calendars" section in the Settings tab: list Google + Apple connections with status (connected / error / needs reconnect), per-calendar toggles (persist), add Apple, disconnect Apple (DELETE /api/calendar/apple), reconnect Google (signIn('google')), sign out.
- Every event shows a source badge (Google / Apple) and its calendar color; Apple events treated read-only like Google.
