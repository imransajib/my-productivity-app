import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRedis, stateKey } from '@/lib/db';
import { EMPTY_STATE, mergeStates, sanitizeState, type UserState } from '@/lib/stateMerge';

const MAX_BYTES = 900_000; // stay well under Upstash's 1 MB value limit

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ enabled: false, state: EMPTY_STATE });

  const stored = await redis.get<UserState>(stateKey(email));
  return NextResponse.json(
    { enabled: true, state: stored ? sanitizeState(stored) : EMPTY_STATE },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Merge the device's copy into the account copy and return the merged result. */
export async function PUT(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ enabled: false }, { status: 503 });

  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: 'Too much data' }, { status: 413 });

  let incoming: UserState;
  try {
    incoming = sanitizeState(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const stored = await redis.get<UserState>(stateKey(email));
  const merged = mergeStates(stored ? sanitizeState(stored) : EMPTY_STATE, incoming);
  await redis.set(stateKey(email), merged);
  return NextResponse.json({ enabled: true, state: merged }, { headers: { 'Cache-Control': 'no-store' } });
}
