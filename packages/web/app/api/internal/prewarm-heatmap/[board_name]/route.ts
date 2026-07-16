import { NextResponse } from 'next/server';
import { AURORA_BOARD_NAMES, getBoardSelectorOptions, isAuroraBoardName } from '@/app/lib/board-constants';
import type { AuroraBoardName } from '@boardsesh/shared-schema';
import { ANGLES } from '@/app/lib/board-data';
import { cachedGetHoldHeatmapData } from '@/app/lib/db/queries/climbs/holds-heatmap-cache';
import { DEFAULT_SEARCH_PARAMS } from '@/app/lib/url-utils';
import type { ParsedBoardRouteParameters } from '@/app/lib/types';
import { requireCronAuth } from '@/app/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Max concurrent warm-up queries per run. Keeps DB load reasonable while still
// finishing well inside maxDuration for the largest boards.
const CONCURRENCY = 4;

type PrewarmRouteParams = {
  board_name: string;
};

type WarmTarget = {
  layoutId: number;
  sizeId: number;
  setIds: number[];
  angle: number;
};

function getAnglesForBoard(boardName: AuroraBoardName): number[] {
  // Aurora doesn't sync a per-layout angle table (deliberately excluded —
  // see packages/aurora-sync/src/sync/shared-sync.ts). Every layout for a
  // given board type supports the same fixed angle range, hardcoded in
  // ANGLES. Mirrors packages/backend/src/graphql/resolvers/board/queries.ts.
  return ANGLES[boardName];
}

function buildTargetsForBoard(boardName: AuroraBoardName, anglesByLayout: Map<number, number[]>): WarmTarget[] {
  const selectorOptions = getBoardSelectorOptions();
  const layouts = selectorOptions.layouts[boardName] ?? [];
  const targets: WarmTarget[] = [];

  for (const layout of layouts) {
    const angles = anglesByLayout.get(layout.id) ?? [];
    if (angles.length === 0) continue;

    const sizeKey = `${boardName}-${layout.id}`;
    const sizes = selectorOptions.sizes[sizeKey] ?? [];

    for (const size of sizes) {
      const setKey = `${boardName}-${layout.id}-${size.id}`;
      const sets = selectorOptions.sets[setKey] ?? [];
      if (sets.length === 0) continue;

      // Warm the cache for the "all sets" combination the board-selector UI
      // lands on by default — that matches what first-visit anonymous requests hit.
      const setIds = sets.map((s) => s.id);

      for (const angle of angles) {
        targets.push({
          layoutId: layout.id,
          sizeId: size.id,
          setIds,
          angle,
        });
      }
    }
  }

  return targets;
}

async function warmTarget(boardName: AuroraBoardName, target: WarmTarget): Promise<void> {
  const parsedParams: ParsedBoardRouteParameters = {
    board_name: boardName,
    layout_id: target.layoutId,
    size_id: target.sizeId,
    set_ids: target.setIds,
    angle: target.angle,
  };

  // DEFAULT_SEARCH_PARAMS is exactly what urlParamsToSearchParams returns for an
  // empty querystring, so the warmed cache key matches a real first-visit request
  // byte-for-byte. Don't substitute anything here or the keys will drift.
  await cachedGetHoldHeatmapData(parsedParams, DEFAULT_SEARCH_PARAMS);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{ warmed: number; failed: number }> {
  let warmed = 0;
  let failed = 0;
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      try {
        await worker(item);
        warmed++;
      } catch (error) {
        failed++;
        console.error('[prewarm-heatmap] warm failed:', error);
      }
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, runOne);
  await Promise.all(runners);

  return { warmed, failed };
}

export async function GET(request: Request, props: { params: Promise<PrewarmRouteParams> }) {
  const startedAt = Date.now();
  const params = await props.params;
  const { board_name: boardNameParam } = params;

  // Auth check — always require valid CRON_SECRET.
  const authError = requireCronAuth(request);
  if (authError) {
    return authError;
  }

  if (!isAuroraBoardName(boardNameParam)) {
    return NextResponse.json(
      {
        error: `Invalid board name: ${boardNameParam}. Expected one of: ${AURORA_BOARD_NAMES.join(', ')}`,
      },
      { status: 400 },
    );
  }
  const boardName = boardNameParam;

  try {
    console.info(`[prewarm-heatmap] starting for ${boardName}`);

    const selectorOptions = getBoardSelectorOptions();
    const layouts = selectorOptions.layouts[boardName] ?? [];

    // Angles are the same across all layouts/sizes/sets for a given board type.
    const angles = getAnglesForBoard(boardName);
    const anglesByLayout = new Map<number, number[]>(layouts.map((layout) => [layout.id, angles]));

    const targets = buildTargetsForBoard(boardName, anglesByLayout);
    console.info(`[prewarm-heatmap] ${boardName}: ${targets.length} combinations to warm`);

    const { warmed, failed } = await runWithConcurrency(targets, CONCURRENCY, (target) =>
      warmTarget(boardName, target),
    );

    const durationMs = Date.now() - startedAt;
    console.info(`[prewarm-heatmap] ${boardName} done in ${durationMs}ms — warmed=${warmed} failed=${failed}`);

    return NextResponse.json({
      board: boardName,
      total: targets.length,
      warmed,
      failed,
      durationMs,
    });
  } catch (error) {
    console.error(`[prewarm-heatmap] ${boardName} failed:`, error);
    return NextResponse.json({ success: false, error: 'Prewarm failed' }, { status: 500 });
  }
}
