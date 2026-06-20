import { type ClimbStatsForAngle, getClimbStatsForAllAngles } from '@/app/lib/data/queries';
import type { ErrorResponse, BoardName } from '@/app/lib/types';
import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  props: { params: Promise<{ board_name: string; climb_uuid: string }> },
): Promise<NextResponse<ClimbStatsForAngle[] | ErrorResponse>> {
  const params = await props.params;
  try {
    // Create a minimal parsed params object with just what we need
    const parsedParams = {
      board_name: params.board_name as BoardName,
      climb_uuid: params.climb_uuid,
      // These aren't needed for the climb stats query, but required by the interface
      layout_id: 0,
      size_id: 0,
      set_ids: [] as number[],
      angle: 0,
    };

    const climbStats = await getClimbStatsForAllAngles(parsedParams);

    // Cache at the edge: climb stats change slowly (only when ticks are logged),
    // so serve repeat hits from the CDN instead of invoking the function and
    // hitting Postgres on every request. 5 min fresh, 1 day stale-while-revalidate.
    return NextResponse.json(climbStats, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('Error fetching climb stats:', error);
    return NextResponse.json({ error: 'Failed to fetch climb stats' }, { status: 500 });
  }
}
