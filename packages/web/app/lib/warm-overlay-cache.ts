import { buildOgBoardRenderUrl, buildOverlayUrl } from '@/app/components/board-renderer/util';
import { SITE_URL } from '@/app/lib/seo/base-url';
import type { BoardDetails, Climb } from '@/app/lib/types';

const BASE_URL = process.env.VERCEL_URL ? SITE_URL : 'http://localhost:3000';

type WarmOverlaysOptions = {
  boardDetails: BoardDetails;
  climbs: Pick<Climb, 'frames'>[];
  variant: 'thumbnail' | 'full';
  maxImages?: number;
};

/**
 * Fire-and-forget fetches to warm the Vercel Edge CDN cache for
 * WASM-rendered board overlay images. Fetches start immediately
 * (overlapping with SSR response streaming) so overlays are cached
 * before the client hydrates and requests them.
 *
 * On the climb view pages (`variant: 'full'`) this also warms the shared
 * og:image on the backend, so the base+byte caches are primed before anyone
 * shares the climb — the first crawler fetch is then a warm hit.
 */
export function scheduleOverlayWarming(options: WarmOverlaysOptions): void {
  // Fire-and-forget — don't await. The serverless function stays alive
  // while the SSR response is still streaming, giving these fetches
  // time to complete and populate the CDN cache.
  void warmOverlays(options);
}

// Exported for tests; `scheduleOverlayWarming` is the production entry point.
export async function warmOverlays(options: WarmOverlaysOptions): Promise<void> {
  try {
    const { boardDetails, climbs, variant, maxImages = 20 } = options;
    const isThumbnail = variant === 'thumbnail';
    const toWarm = climbs.slice(0, maxImages);

    const warmTargets: string[] = [];
    for (const climb of toWarm) {
      warmTargets.push(`${BASE_URL}${buildOverlayUrl(boardDetails, climb.frames, isThumbnail)}`);

      // Only the full climb-view pages warm the og card. A thumbnail list would
      // fan out one backend og render per row for images no crawler fetches.
      // Skip the relative web-render fallback: only the absolute backend URL
      // primes the long-running renderer's base+byte caches.
      if (variant === 'full') {
        const ogUrl = buildOgBoardRenderUrl(boardDetails, climb.frames);
        if (ogUrl.startsWith('http')) {
          warmTargets.push(ogUrl);
        }
      }
    }

    await Promise.allSettled(
      warmTargets.map((url) =>
        fetch(url)
          .then((response) => response.body?.cancel())
          .catch(() => {}),
      ),
    );
  } catch {
    // Warming failures must never propagate
  }
}
