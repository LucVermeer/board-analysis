import 'server-only';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type {
  BoardRouteParameters,
  ParsedBoardRouteParametersWithUuid,
  ParsedBoardRouteParameters,
  BoardRouteParametersWithUuid,
  BoardName,
} from '@/app/lib/types';
import { getLayoutBySlug, getSizeBySlug, getSetsBySlug } from './slug-utils';
import {
  isNumericId,
  extractUuidFromSlug,
  hasOnlyNumericBoardRouteSegments,
  parseBoardRouteParams,
  getMoonBoardLayoutBySlug,
} from './url-utils';
import { type MoonBoardLayoutKey, MOONBOARD_LAYOUTS, MOONBOARD_SETS, MOONBOARD_SIZE } from './moonboard-config';

// Helper to parse MoonBoard size slug (always returns the single size)
function getMoonBoardSizeBySlug(): { id: number; name: string } {
  return { id: MOONBOARD_SIZE.id, name: MOONBOARD_SIZE.name };
}

// Helper to parse MoonBoard set slugs
function getMoonBoardSetsBySlug(layoutKey: MoonBoardLayoutKey, setSlug: string): { id: number; name: string }[] {
  const sets = MOONBOARD_SETS[layoutKey] || [];
  const slugParts = setSlug.split('-').map((s) => s.toLowerCase());

  // Try to match sets by name
  return sets.filter((set) => {
    const setNameLower = set.name.toLowerCase().replace(/\s+/g, '-');
    return slugParts.some((part) => setNameLower.includes(part) || set.name.toLowerCase().includes(part));
  });
}

// Enhanced route parsing function that handles both slug and numeric formats
export async function parseBoardRouteParamsWithSlugs<T extends BoardRouteParameters>(
  params: T,
): Promise<T extends BoardRouteParametersWithUuid ? ParsedBoardRouteParametersWithUuid : ParsedBoardRouteParameters> {
  const { board_name, layout_id, size_id, set_ids, angle, climb_uuid } = params;
  const isFullyNumericFormat = hasOnlyNumericBoardRouteSegments(params);

  let parsedLayoutId: number;
  let parsedSizeId: number;
  let parsedSetIds: number[];

  // Handle MoonBoard separately (uses static config instead of database)
  if (board_name === 'moonboard') {
    // Handle layout_id (slug or numeric)
    if (isFullyNumericFormat && isNumericId(layout_id)) {
      parsedLayoutId = Number(layout_id);
    } else {
      const layout = getMoonBoardLayoutBySlug(layout_id);
      if (!layout) {
        return notFound();
      }
      parsedLayoutId = layout.id;
    }

    // Handle size_id (slug or numeric) - MoonBoard has single size
    if (isFullyNumericFormat && isNumericId(size_id)) {
      parsedSizeId = Number(size_id);
    } else {
      const size = getMoonBoardSizeBySlug();
      parsedSizeId = size.id;
    }

    // Handle set_ids (slug or numeric)
    const decodedSetIds = decodeURIComponent(set_ids);
    if (isFullyNumericFormat && isNumericId(decodedSetIds.split(',')[0])) {
      parsedSetIds = decodedSetIds.split(',').map((id) => Number(id));
    } else {
      // Find the layout key to get sets
      const layoutEntry = Object.entries(MOONBOARD_LAYOUTS).find(([, l]) => l.id === parsedLayoutId);
      if (!layoutEntry) {
        return notFound();
      }
      const layoutKey = layoutEntry[0] as MoonBoardLayoutKey;
      const sets = getMoonBoardSetsBySlug(layoutKey, decodedSetIds);
      if (sets.length === 0) {
        // If no match, try to get all sets for this layout
        const allSets = MOONBOARD_SETS[layoutKey] || [];
        parsedSetIds = allSets.map((s) => s.id);
      } else {
        parsedSetIds = sets.map((set) => set.id);
      }
    }

    const parsedParams = {
      board_name: board_name as BoardName,
      layout_id: parsedLayoutId,
      size_id: parsedSizeId,
      set_ids: parsedSetIds,
      angle: Number(angle),
    };

    if (climb_uuid) {
      return {
        ...parsedParams,
        climb_uuid: extractUuidFromSlug(climb_uuid),
      } as T extends BoardRouteParametersWithUuid ? ParsedBoardRouteParametersWithUuid : never;
    }

    return parsedParams as T extends BoardRouteParametersWithUuid ? never : ParsedBoardRouteParameters;
  }

  // Aurora boards - prefer slug resolution on mixed-format routes so numeric-looking
  // slugs like grasshopper's `2020` are treated as slugs, not numeric IDs.
  if (isFullyNumericFormat && isNumericId(layout_id)) {
    parsedLayoutId = Number(layout_id);
  } else {
    const layout = await getLayoutBySlug(board_name as BoardName, layout_id);
    if (layout) {
      parsedLayoutId = layout.id;
    } else if (isNumericId(layout_id)) {
      parsedLayoutId = Number(layout_id);
    } else {
      return notFound();
    }
  }

  // Handle size_id (slug or numeric)
  if (isFullyNumericFormat && isNumericId(size_id)) {
    parsedSizeId = Number(size_id);
  } else {
    const size = await getSizeBySlug(board_name as BoardName, parsedLayoutId, size_id);
    if (size) {
      parsedSizeId = size.id;
    } else if (isNumericId(size_id)) {
      parsedSizeId = Number(size_id);
    } else {
      return notFound();
    }
  }

  // Handle set_ids (slug or numeric)
  const decodedSetIds = decodeURIComponent(set_ids);
  if (isFullyNumericFormat && isNumericId(decodedSetIds.split(',')[0])) {
    parsedSetIds = decodedSetIds.split(',').map((id) => Number(id));
  } else {
    const sets = await getSetsBySlug(board_name as BoardName, parsedLayoutId, parsedSizeId, decodedSetIds);
    if (sets && sets.length > 0) {
      parsedSetIds = sets.map((set) => set.id);
    } else if (decodedSetIds.split(',').every((id) => isNumericId(id.trim()))) {
      parsedSetIds = decodedSetIds.split(',').map((id) => Number(id));
    } else {
      return notFound();
    }
  }

  const parsedParams = {
    board_name,
    layout_id: parsedLayoutId,
    size_id: parsedSizeId,
    set_ids: parsedSetIds,
    angle: Number(angle),
  };

  if (climb_uuid) {
    return {
      ...parsedParams,
      climb_uuid: extractUuidFromSlug(climb_uuid),
    } as T extends BoardRouteParametersWithUuid ? ParsedBoardRouteParametersWithUuid : never;
  }

  return parsedParams as T extends BoardRouteParametersWithUuid ? never : ParsedBoardRouteParameters;
}

/**
 * Checks whether route parameters contain numeric IDs (old URL format) vs slugs (new format),
 * then parses them accordingly. Returns both the parsed params and a flag indicating the format.
 *
 * This consolidates the repeated hasNumericParams + parse pattern used across route files.
 */
async function parseRouteParamsImpl<T extends BoardRouteParameters>(
  params: T,
): Promise<{
  parsedParams: T extends BoardRouteParametersWithUuid
    ? ParsedBoardRouteParametersWithUuid
    : ParsedBoardRouteParameters;
  isNumericFormat: boolean;
}> {
  const isNumericFormat = hasOnlyNumericBoardRouteSegments(params);

  if (isNumericFormat) {
    // For UUID routes, extract the UUID from the slug before parsing
    const paramsToPass = (params as BoardRouteParametersWithUuid).climb_uuid
      ? {
          ...params,
          climb_uuid: extractUuidFromSlug((params as BoardRouteParametersWithUuid).climb_uuid),
        }
      : params;

    const parsedParams = parseBoardRouteParams(paramsToPass);
    const hasInvalidNumericIds =
      Number.isNaN(parsedParams.layout_id) ||
      Number.isNaN(parsedParams.size_id) ||
      Number.isNaN(parsedParams.angle) ||
      parsedParams.set_ids.some((id) => Number.isNaN(id));

    if (hasInvalidNumericIds) {
      return {
        parsedParams: await parseBoardRouteParamsWithSlugs(params),
        isNumericFormat: false,
      };
    }

    return {
      parsedParams,
      isNumericFormat: true,
    };
  }

  return {
    parsedParams: await parseBoardRouteParamsWithSlugs(params),
    isNumericFormat: false,
  };
}

export const parseRouteParams = cache(parseRouteParamsImpl);

/**
 * 301-redirect to `viewUrl` with the original search params reserialised onto
 * the new URL. Shared by the two `/play/[climb_uuid]` redirect pages so the
 * URLSearchParams + permanentRedirect boilerplate lives in one place.
 *
 * Never returns — `permanentRedirect` throws.
 */
export function redirectWithQuery(viewUrl: string, searchParams: Record<string, string | string[]>): never {
  const queryString = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((v) => [key, v] as [string, string]) : [[key, value] as [string, string]],
    ),
  ).toString();
  permanentRedirect(queryString ? `${viewUrl}?${queryString}` : viewUrl);
}
