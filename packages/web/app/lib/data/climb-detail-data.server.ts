import { dbz } from '@/app/lib/db/db';
import { eq, and } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { climbCommunityStatus } from '@/app/lib/db/schema';

type FetchClimbDetailDataParams = {
  boardName: string;
  climbUuid: string;
  angle: number;
};

async function fetchClimbDetailDataUncached({ boardName, climbUuid, angle }: FetchClimbDetailDataParams) {
  try {
    const [result] = await dbz
      .select({ communityGrade: climbCommunityStatus.communityGrade })
      .from(climbCommunityStatus)
      .where(
        and(
          eq(climbCommunityStatus.climbUuid, climbUuid),
          eq(climbCommunityStatus.boardType, boardName),
          eq(climbCommunityStatus.angle, angle),
        ),
      )
      .limit(1);

    return { communityGrade: result?.communityGrade ?? null };
  } catch {
    return { communityGrade: null };
  }
}

export async function fetchClimbDetailData(params: FetchClimbDetailDataParams) {
  const cachedFn = unstable_cache(
    async () => fetchClimbDetailDataUncached(params),
    ['climb-community', params.boardName, params.climbUuid, String(params.angle)],
    {
      revalidate: 3600,
      tags: [`climb-${params.climbUuid}`],
    },
  );
  return cachedFn();
}
