import { NextResponse } from 'next/server';
import { LATEST } from '@/lib/changelog';

// Baked in at build time, so each deployment answers with its own build id.
export function GET() {
  return NextResponse.json(
    {
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      build: process.env.NEXT_PUBLIC_BUILD_ID,
      notes: LATEST.notes,
      date: LATEST.date,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
