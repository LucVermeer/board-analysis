'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { BoardDetails, Climb } from '@/app/lib/types';
import { constructClimbListWithSlugs, getContextAwareClimbViewUrl } from '@/app/lib/url-utils';

type DrawerUrlSyncSource = 'list-tap' | 'direct';

type UseDrawerUrlSyncArgs = {
  isOpen: boolean;
  displayedClimb: Climb | null;
  boardDetails: BoardDetails;
  angle: number;
  /** Called when the user navigates away from the /view/ URL (e.g. browser back). */
  onClose: () => void;
  /** When false, the hook does nothing. Mirrors viewOnlyMode / disabled cases. */
  enabled?: boolean;
};

/**
 * Keeps the browser URL in sync with the PlayViewDrawer's open state.
 *
 * Two effects:
 * - The `isOpen` effect owns the popstate listener and the close-cleanup
 *   (return the URL to the list / pop the pushed entry when the drawer closes).
 * - The `displayedClimb` effect owns the actual URL mutation — pushState the
 *   first time we see a climb on a non-/view/ pathname, replaceState on every
 *   subsequent climb change. This is split out so the URL push fires when the
 *   climb arrives from the queue bridge a render after `isOpen` flipped (the
 *   bridge between the deep `GraphQLQueueProvider` and the root QueueControlBar
 *   propagates via an effect, lagging by one render in solo mode).
 *
 * The history.state payload stamps each entry so coexisting URL handlers
 * (e.g. the PlayViewClient at /play/) can distinguish their pushes from ours.
 */
export function useDrawerUrlSync({
  isOpen,
  displayedClimb,
  boardDetails,
  angle,
  onClose,
  enabled = true,
}: UseDrawerUrlSyncArgs): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Refs let the effects read the latest pathname / searchParams / onClose
  // without re-subscribing the popstate listener every render.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const boardDetailsRef = useRef(boardDetails);
  boardDetailsRef.current = boardDetails;
  const angleRef = useRef(angle);
  angleRef.current = angle;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Cached source for the current drawer-open lifecycle. Set by the URL
  // mutation effect on the first push/replace, cleared by the close cleanup.
  const sourceRef = useRef<DrawerUrlSyncSource | null>(null);
  // Pathname at the moment the drawer started opening — used to derive `source`
  // and to compute the right list URL on close (since pathnameRef may have
  // moved on by the time cleanup fires).
  const openStartPathnameRef = useRef<string | null>(null);

  // Effect A — open/close lifecycle: popstate listener + URL restoration.
  useEffect(() => {
    if (!enabled || !isOpen) {
      return;
    }
    openStartPathnameRef.current = pathnameRef.current;

    const handlePopState = () => {
      if (!window.location.pathname.includes('/view/')) {
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      const startPathname = openStartPathnameRef.current ?? pathnameRef.current;
      openStartPathnameRef.current = null;
      const source = sourceRef.current;
      sourceRef.current = null;
      if (!window.location.pathname.includes('/view/')) {
        // popstate already navigated us off /view/ — nothing left to do.
        return;
      }
      // User-initiated close (close button, swipe-down, etc.). Restore the URL.
      if (source === 'list-tap') {
        // Pop the entry we pushed when opening so back-button history stays clean.
        window.history.back();
      } else {
        // Direct hit (or never-pushed) — replace forward to the list URL.
        // Pushing would trap the user: Back from /list would return to
        // /view/{uuid} where the drawer is closed but the URL still says open.
        const listUrl = withSearchParams(
          getListUrl(boardDetailsRef.current, angleRef.current, startPathname),
          searchParamsRef.current,
        );
        window.history.replaceState({ ...(window.history.state ?? {}) }, '', listUrl);
      }
    };
  }, [isOpen, enabled]);

  // Effect B — URL push/replace whenever the displayed climb is available.
  // Fires on isOpen flips AND on climb changes, so a solo /b/ tap (where the
  // climb arrives one render after isOpen via the queue bridge) still gets
  // its URL pushed.
  useEffect(() => {
    if (!enabled || !isOpen || !displayedClimb) return;

    const startPathname = openStartPathnameRef.current ?? pathnameRef.current;
    const viewUrl = withSearchParams(
      getContextAwareClimbViewUrl(
        startPathname,
        boardDetailsRef.current,
        angleRef.current,
        displayedClimb.uuid,
        displayedClimb.name,
      ),
      searchParamsRef.current,
    );

    // Derive source once per open lifecycle: if we direct-hit a /view/ URL
    // it's 'direct'; otherwise we'll be pushing over /list, /b/.../list, etc.
    if (!sourceRef.current) {
      sourceRef.current = startPathname.includes('/view/') ? 'direct' : 'list-tap';
    }
    const stampedState = {
      ...(window.history.state ?? {}),
      boardseshDrawerUrlSync: { climbUuid: displayedClimb.uuid, source: sourceRef.current },
    };

    if (window.location.pathname.includes('/view/')) {
      // Either a direct-hit refresh of the URL or a climb-change replace.
      window.history.replaceState(stampedState, '', viewUrl);
    } else {
      // First time we have a climb on a non-/view/ pathname — push.
      window.history.pushState(stampedState, '', viewUrl);
    }
  }, [isOpen, displayedClimb?.uuid, enabled]);
}

function withSearchParams(url: string, searchParams: URLSearchParams): string {
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function getListUrl(boardDetails: BoardDetails, angle: number, pathname: string): string {
  // Preserve the short /b/{slug}/{angle}/ route shape when the user came from there.
  // The route tree has no index page under /b/{slug}/{angle}, so we must point
  // at /list explicitly to avoid a 404.
  const boardSlugMatch = pathname.match(/^(\/[a-z]{2}(?:-[A-Z]{2})?)?\/b\/([^/]+)\/(\d+)/);
  if (boardSlugMatch) {
    const localePrefix = boardSlugMatch[1] ?? '';
    return `${localePrefix}/b/${boardSlugMatch[2]}/${boardSlugMatch[3]}/list`;
  }
  const { board_name, layout_name, size_name, size_description, set_names } = boardDetails;
  if (layout_name && size_name && set_names) {
    return constructClimbListWithSlugs(board_name, layout_name, size_name, size_description, set_names, angle);
  }
  return `/${board_name}/${boardDetails.layout_id}/${boardDetails.size_id}/${boardDetails.set_ids.join(',')}/${angle}/list`;
}
