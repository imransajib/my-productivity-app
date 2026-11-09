import 'server-only';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { Redis } from '@upstash/redis';
import { APPLE_COOKIE_NAME } from '@/lib/crypto';

/**
 * Server-side storage (Upstash Redis), keyed by the signed-in Google account,
 * so every device the user signs into sees the same data.
 */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** Stable, non-reversible id for an account (we never store raw emails as keys). */
export function userId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

const appleKey = (email: string) => `apex:apple:${userId(email)}`;
export const stateKey = (email: string) => `apex:state:${userId(email)}`;

/**
 * Encrypted Apple credentials blob (AES-256-GCM via src/lib/crypto.ts).
 * Reads the account copy first; a credential still living in this browser's
 * old cookie is migrated to the account automatically.
 */
export async function readAppleRaw(email: string | null | undefined): Promise<string | undefined> {
  const redis = getRedis();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(APPLE_COOKIE_NAME)?.value;

  if (!redis || !email) return cookieValue;

  const stored = await redis.get<string>(appleKey(email));
  if (stored) return stored;

  if (cookieValue) {
    await redis.set(appleKey(email), cookieValue);
    cookieStore.delete(APPLE_COOKIE_NAME);
    return cookieValue;
  }
  return undefined;
}

export async function writeAppleRaw(email: string | null | undefined, encrypted: string): Promise<void> {
  const redis = getRedis();
  const cookieStore = await cookies();
  if (redis && email) {
    await redis.set(appleKey(email), encrypted);
    cookieStore.delete(APPLE_COOKIE_NAME);
    return;
  }
  // No database configured (e.g. local dev without env): keep the old per-browser cookie behaviour
  const { getAppleCookieOptions } = await import('@/lib/crypto');
  cookieStore.set(APPLE_COOKIE_NAME, encrypted, getAppleCookieOptions());
}

export async function deleteAppleRaw(email: string | null | undefined): Promise<void> {
  const redis = getRedis();
  const cookieStore = await cookies();
  cookieStore.delete(APPLE_COOKIE_NAME);
  if (redis && email) await redis.del(appleKey(email));
}
