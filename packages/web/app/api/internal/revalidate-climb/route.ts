import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Backend mutations call this route after a climb's row or its community
 * status row changes. We revalidate the `climb-${uuid}` tag so the next
 * /[board]/.../view/[climb_uuid] render rebuilds with fresh data instead of
 * waiting for the 1h `unstable_cache` TTL to expire.
 *
 * Auth: bearer token equal to CRON_SECRET (same secret as profile-percentiles
 * uses for cron-triggered revalidations — both are server-to-server).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { climbUuid?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { climbUuid } = body;
  if (typeof climbUuid !== 'string' || climbUuid.length === 0) {
    return NextResponse.json({ error: 'climbUuid is required' }, { status: 400 });
  }

  revalidateTag(`climb-${climbUuid}`, { expire: 0 });

  return new NextResponse(null, { status: 204 });
}
