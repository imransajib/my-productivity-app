import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { userId } from '@/lib/db';
import { removeSubscription, saveSubscription, sendPush } from '@/lib/push';
import { remindersEnabled } from '@/lib/reminderSchedule';

/** Save this device's push subscription to the account. */
export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; test?: boolean } | null;
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !/^https:\/\//.test(sub.endpoint)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  const uid = userId(email);
  await saveSubscription(uid, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  if (body?.test) {
    await sendPush(uid, { title: 'Notifications are on', body: 'Apex will remind you about your tasks.', tag: 'apex-test', url: '/' });
  }
  return NextResponse.json({ ok: true, serverReminders: remindersEnabled() });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { endpoint } = ((await request.json().catch(() => ({}))) ?? {}) as { endpoint?: string };
  if (endpoint) await removeSubscription(userId(email), endpoint);
  return NextResponse.json({ ok: true });
}
