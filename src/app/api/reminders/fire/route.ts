import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { getRedis, stateKeyForUid } from '@/lib/db';
import { sendPush } from '@/lib/push';
import { reminderBody } from '@/lib/reminders';
import { sanitizeState, type UserState } from '@/lib/stateMerge';

/** Called by QStash at the reminder time. Verifies the signature, re-checks the task, sends the push. */
export async function POST(request: NextRequest) {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get('upstash-signature') ?? '';
  const valid = await new Receiver({ currentSigningKey: current, nextSigningKey: next })
    .verify({ signature, body: raw })
    .catch(() => false);
  if (!valid) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });

  const { uid, taskId, at } = JSON.parse(raw) as { uid: string; taskId: string; at: string };
  const redis = getRedis();
  if (!redis || !uid || !taskId) return NextResponse.json({ ok: false });

  const stored = await redis.get<UserState>(stateKeyForUid(uid));
  const task = stored ? sanitizeState(stored).tasks.find((t) => t.id === taskId) : undefined;
  // Skip if the task was deleted, completed, or its reminder moved since this was scheduled
  if (!task || task.isCompleted || task.reminderAt !== at) return NextResponse.json({ ok: true, skipped: true });

  await redis.hdel(`apex:remsched:${uid}`, taskId);
  const result = await sendPush(uid, { title: task.title, body: reminderBody(task), tag: `task-${task.id}`, url: '/?tab=tasks' });
  return NextResponse.json({ ok: true, ...result });
}
