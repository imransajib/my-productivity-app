import 'server-only';
import * as webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { getRedis } from '@/lib/db';

const pushKey = (uid: string) => `apex:push:${uid}`;
let configured = false;

function configure(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('mailto:support@apexplanner.app', pub, priv);
  configured = true;
  return true;
}

export async function saveSubscription(uid: string, sub: PushSubscription) {
  const redis = getRedis();
  if (!redis) throw new Error('No database');
  await redis.hset(pushKey(uid), { [sub.endpoint]: JSON.stringify(sub) });
}

export async function removeSubscription(uid: string, endpoint: string) {
  await getRedis()?.hdel(pushKey(uid), endpoint);
}

export async function hasSubscriptions(uid: string): Promise<number> {
  return (await getRedis()?.hlen(pushKey(uid))) ?? 0;
}

/** Send to every device this account enabled notifications on; prunes dead subscriptions. */
export async function sendPush(uid: string, payload: { title: string; body: string; tag?: string; url?: string }) {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0 };
  const subs = (await redis.hgetall<Record<string, string | PushSubscription>>(pushKey(uid))) ?? {};
  let sent = 0;
  await Promise.all(
    Object.entries(subs).map(async ([endpoint, raw]) => {
      const sub = typeof raw === 'string' ? (JSON.parse(raw) as PushSubscription) : raw;
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'high' });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await redis.hdel(pushKey(uid), endpoint);
        else console.error('push failed', code);
      }
    })
  );
  return { sent };
}
