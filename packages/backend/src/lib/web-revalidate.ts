/**
 * Backend → web cache-invalidation helper.
 *
 * The web app caches climb data via `unstable_cache` tagged `climb-${uuid}`.
 * When backend mutations change a climb's row or its community status, the
 * web cache won't see the change until the 1h TTL expires unless we tell it.
 *
 * This is fire-and-forget by design — a network blip between backend and
 * web must NOT fail a mutation that already wrote to the database. Worst
 * case: stale view for up to 1h, identical to what we'd see without the
 * call.
 */

const WEB_URL = process.env.BOARDSESH_WEB_URL;
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;
const REQUEST_TIMEOUT_MS = 5000;

let warned = false;

export async function notifyClimbRevalidated(climbUuid: string): Promise<void> {
  if (!WEB_URL || !REVALIDATE_SECRET) {
    if (!warned) {
      console.warn(
        '[web-revalidate] BOARDSESH_WEB_URL or REVALIDATE_SECRET not set; climb-cache invalidation disabled. Cached climb pages will refresh on the configured TTL.',
      );
      warned = true;
    }
    return;
  }

  // Bound the call so a slow or unreachable web service can't pile up
  // pending promises under mutation load.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${WEB_URL}/api/internal/revalidate-climb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${REVALIDATE_SECRET}`,
      },
      body: JSON.stringify({ climbUuid }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[web-revalidate] climb-cache invalidation failed for ${climbUuid}: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`[web-revalidate] climb-cache invalidation network error for ${climbUuid}:`, error);
  } finally {
    clearTimeout(timeout);
  }
}
