import { permanentRedirect } from 'next/navigation';
import type { BoardRouteParametersWithUuid } from '@/app/lib/types';
import { parseRouteParams } from '@/app/lib/url-utils.server';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { getClimb } from '@/app/lib/data/queries';
import { constructClimbViewUrl, constructClimbViewUrlWithSlugs } from '@/app/lib/url-utils';

/**
 * Old `/play/[climb_uuid]` URLs 301-redirect to the equivalent `/view/[climb_uuid]`.
 * The standalone play page is gone; the play-view drawer is the single climb
 * surface and handles multi-frame playback inline. Bookmarks and shared links
 * keep working through this redirect.
 */
export default async function PlayRedirectPage(props: {
  params: Promise<BoardRouteParametersWithUuid>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const { parsedParams } = await parseRouteParams(params);
  const boardDetails = getBoardDetailsForBoard(parsedParams);

  // Look up the climb name so the slug-prefixed view URL is preserved.
  // If the climb can't be resolved we still redirect — just without the slug.
  let climbName: string | undefined;
  try {
    const climb = await getClimb(parsedParams);
    climbName = climb?.name ?? undefined;
  } catch {
    climbName = undefined;
  }

  const viewUrl =
    boardDetails.layout_name && boardDetails.size_name && boardDetails.set_names
      ? constructClimbViewUrlWithSlugs(
          parsedParams.board_name,
          boardDetails.layout_name,
          boardDetails.size_name,
          boardDetails.size_description,
          boardDetails.set_names,
          parsedParams.angle,
          parsedParams.climb_uuid,
          climbName,
        )
      : constructClimbViewUrl(parsedParams, parsedParams.climb_uuid, climbName);

  const queryString = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((v) => [key, v] as [string, string]) : [[key, value] as [string, string]],
    ),
  ).toString();

  permanentRedirect(queryString ? `${viewUrl}?${queryString}` : viewUrl);
}
