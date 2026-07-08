import { NextResponse } from 'next/server';

/** Liveness probe (SPEC §14). Cheap, no DB round-trip. */
export function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
