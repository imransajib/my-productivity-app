import 'server-only';
import { getRedis, userId } from '@/lib/db';
import type { Task } from '@/lib/types';

/**
 * Server-side reminder scheduling with Upstash QStash: each upcoming reminder becomes one
 * delayed message to /api/reminders/fire. Without QSTASH_TOKEN this is a no-op and
 * reminders only fire while the app is open.
 */
const schedKey = (email: string) => `apex:remsched:${userId(email)}`;
const MAX_AHEAD_MS = 6 * 24 * 60 * 60 * 1000; // QStash free tier max delay is 7 days; re-scheduled on later syncs

interface Scheduled {
  at: string;
  msgId: string;
}

export function remindersEnabled(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

const qstashBase = () => (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');

async function publish(destination: string, body: unknown, notBeforeSec: number): Promise<string | null> {
  const res = await fetch(`${qstashBase()}/v2/publish/${destination}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
      'Content-Type': 'application/json',
      'Upstash-Not-Before': String(notBeforeSec),
      'Upstash-Retries': '2',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('qstash publish failed', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { messageId?: string };
  return data.messageId ?? null;
}

async function cancel(msgId: string) {
  await fetch(`${qstashBase()}/v2/messages/${msgId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
  }).catch(() => {});
}

export async function syncReminderSchedule(email: string, tasks: Task[], origin: string) {
  const redis = getRedis();
  if (!redis || !remindersEnabled()) return;
  const now = Date.now();

  const desired = new Map<string, string>();
  for (const t of tasks) {
    if (t.isCompleted || !t.reminderAt) continue;
    const at = Date.parse(t.reminderAt);
    if (!at || at <= now - 60_000 || at > now + MAX_AHEAD_MS) continue;
    desired.set(t.id, t.reminderAt);
  }

  const current = ((await redis.hgetall<Record<string, Scheduled | string>>(schedKey(email))) ?? {}) as Record<string, Scheduled | string>;
  const parsed: Record<string, Scheduled> = {};
  for (const [id, v] of Object.entries(current)) parsed[id] = typeof v === 'string' ? (JSON.parse(v) as Scheduled) : v;

  const destination = `${origin}/api/reminders/fire`;
  const updates: Record<string, string> = {};
  const removals: string[] = [];

  for (const [id, s] of Object.entries(parsed)) {
    const want = desired.get(id);
    if (!want || want !== s.at) {
      await cancel(s.msgId);
      if (!want) removals.push(id);
    }
  }
  for (const [id, at] of desired) {
    if (parsed[id]?.at === at) continue;
    const msgId = await publish(destination, { uid: userId(email), taskId: id, at }, Math.floor(Math.max(Date.parse(at), now) / 1000));
    if (msgId) updates[id] = JSON.stringify({ at, msgId } satisfies Scheduled);
  }

  if (Object.keys(updates).length) await redis.hset(schedKey(email), updates);
  if (removals.length) await redis.hdel(schedKey(email), ...removals);
}

export async function clearScheduled(email: string, taskId: string) {
  await getRedis()?.hdel(schedKey(email), taskId);
}
