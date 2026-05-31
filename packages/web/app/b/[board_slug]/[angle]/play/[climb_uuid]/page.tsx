import { notFound, permanentRedirect } from 'next/navigation';
import { resolveBoardBySlug, boardToRouteParams } from '@/app/lib/board-slug-utils';
import { getClimb } from '@/app/lib/data/queries';
import { constructBoardSlugViewUrl, extractUuidFromSlug } from '@/app/lib/url-utils';

/**
 * Old `/b/{board_slug}/{angle}/play/[climb_uuid]` URLs 301-redirect to the
 * equivalent `/b/{board_slug}/{angle}/view/[climb_uuid]`. See the canonical
 * redirect page for context.
 */
export default async function BoardSlugPlayRedirectPage(props: {
  params: Promise<{ board_slug: string; angle: string; climb_uuid: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const board = await resolveBoardBySlug(params.board_slug);
  if (!board) return notFound();

  const angle = Number(params.angle);
  const climbUuid = extractUuidFromSlug(params.climb_uuid);

  // Look up the climb name so the slug-prefixed view URL is preserved.
  let climbName: string | undefined;
  try {
    const parsedParams = { ...boardToRouteParams(board, angle), climb_uuid: climbUuid };
    const climb = await getClimb(parsedParams);
    climbName = climb?.name ?? undefined;
  } catch {
    climbName = undefined;
  }

  const viewUrl = constructBoardSlugViewUrl(params.board_slug, angle, climbUuid, climbName);

  const queryString = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((v) => [key, v] as [string, string]) : [[key, value] as [string, string]],
    ),
  ).toString();

  permanentRedirect(queryString ? `${viewUrl}?${queryString}` : viewUrl);
}
