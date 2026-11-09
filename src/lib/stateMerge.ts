import type { CalendarEvent, Category, Task } from '@/lib/types';

/** Everything that follows the user across devices (remote Google/Apple events are re-fetched, not stored). */
export interface UserState {
  tasks: Task[];
  events: CalendarEvent[]; // local events only
  categories: Category[];
  deleted: Record<string, string>; // id -> ISO time it was deleted (tombstones)
  prefs: { googleCalendarIds?: string[] | null; updatedAt?: string };
}

export const EMPTY_STATE: UserState = { tasks: [], events: [], categories: [], deleted: {}, prefs: {} };

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

function mergeById<T extends { id: string; updatedAt?: string }>(a: T[], b: T[], deleted: Record<string, string>): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    // last writer wins; on a tie the later list (b) wins
    if (!prev || time(item.updatedAt) >= time(prev.updatedAt)) map.set(item.id, item);
  }
  // a delete wins unless the item was edited after it was deleted
  return [...map.values()].filter((it) => !deleted[it.id] || time(it.updatedAt) > time(deleted[it.id]));
}

/** Pure, deterministic merge used on both client and server. `b` is the newer side on ties. */
export function mergeStates(a: UserState, b: UserState): UserState {
  const now = Date.now();
  const deleted: Record<string, string> = {};
  for (const src of [a.deleted ?? {}, b.deleted ?? {}]) {
    for (const [id, at] of Object.entries(src)) {
      if (now - time(at) > TOMBSTONE_TTL_MS) continue;
      if (!deleted[id] || time(at) > time(deleted[id])) deleted[id] = at;
    }
  }
  const categories = new Map<string, Category>();
  for (const c of [...(a.categories ?? []), ...(b.categories ?? [])]) if (c?.id) categories.set(c.id, c);

  const prefs = time(b.prefs?.updatedAt) >= time(a.prefs?.updatedAt) ? b.prefs ?? {} : a.prefs ?? {};

  return {
    tasks: mergeById(a.tasks ?? [], b.tasks ?? [], deleted),
    events: mergeById(
      (a.events ?? []).filter(isLocalEvent),
      (b.events ?? []).filter(isLocalEvent),
      deleted
    ),
    categories: [...categories.values()],
    deleted,
    prefs,
  };
}

export function isLocalEvent(e: CalendarEvent): boolean {
  return e.source !== 'google' && e.source !== 'apple';
}

/** Light validation of untrusted input. */
export function sanitizeState(input: unknown): UserState {
  const s = (input ?? {}) as Partial<UserState>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).slice(0, 5000) : []);
  const deleted: Record<string, string> = {};
  if (s.deleted && typeof s.deleted === 'object') {
    for (const [k, v] of Object.entries(s.deleted).slice(0, 10000)) if (typeof v === 'string') deleted[k] = v;
  }
  const prefs = s.prefs && typeof s.prefs === 'object' ? s.prefs : {};
  return {
    tasks: arr<Task>(s.tasks).filter((t) => t && typeof t.id === 'string'),
    events: arr<CalendarEvent>(s.events).filter((e) => e && typeof e.id === 'string'),
    categories: arr<Category>(s.categories).filter((c) => c && typeof c.id === 'string'),
    deleted,
    prefs: {
      googleCalendarIds: Array.isArray(prefs.googleCalendarIds) ? prefs.googleCalendarIds.filter((x) => typeof x === 'string') : null,
      updatedAt: typeof prefs.updatedAt === 'string' ? prefs.updatedAt : undefined,
    },
  };
}
