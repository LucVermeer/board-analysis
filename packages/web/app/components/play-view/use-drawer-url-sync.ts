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
 * - Opening the drawer pushes `/view/{climb_uuid}` onto history (or replaces
 *   the current entry if the user already direct-hit a /view/ URL).
 * - Changing the displayed climb (prev/next/swipe) calls `replaceState` so the
 *   address bar tracks the visible climb without piling up history entries.
 * - Closing the drawer strips the /view/ segment back to the list URL.
 * - A browser back gesture (popstate) closes the drawer via the `onClose`
 *   callback.
 *
 * The history.state payload stamps each entry so coexisting URL handlers (e.g.
 * the PlayViewClient at /play/) can distinguish their own pushes from ours.
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

  // Refs let the open effect read the latest pathname / searchParams / onClose
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

  const sourceRef = useRef<DrawerUrlSyncSource | null>(null);

  // Open: push the view URL onto history and listen for back.
  useEffect(() => {
    // TEMP debug — remove once /b/ URL sync confirmed working.
    // eslint-disable-next-line no-console
    console.info('[useDrawerUrlSync] open-effect', {
      enabled,
      isOpen,
      hasClimb: !!displayedClimb,
      climbUuid: displayedClimb?.uuid ?? null,
      pathname: typeof window !== 'undefined' ? window.location.pathname : '(ssr)',
    });
    if (!enabled || !isOpen || !displayedClimb) {
      sourceRef.current = null;
      return;
    }

    const startPathname = pathnameRef.current;
    const startSearchParams = searchParamsRef.current;
    const onViewRoute = startPathname.includes('/view/');
    const source: DrawerUrlSyncSource = onViewRoute ? 'direct' : 'list-tap';
    sourceRef.current = source;

    const viewUrl = withSearchParams(
      getContextAwareClimbViewUrl(
        startPathname,
        boardDetailsRef.current,
        angleRef.current,
        displayedClimb.uuid,
        displayedClimb.name,
      ),
      startSearchParams,
    );
    // TEMP debug — remove once /b/ URL sync confirmed working.
    // eslint-disable-next-line no-console
    console.info('[useDrawerUrlSync] push', {
      startPathname,
      viewUrl,
      climbUuid: displayedClimb.uuid,
      source,
      windowPathname: window.location.pathname,
    });

    const baseState = window.history.state ?? {};
    const stampedState = { ...baseState, boardseshDrawerUrlSync: { climbUuid: displayedClimb.uuid, source } };

    if (onViewRoute) {
      // Already on a /view/ URL — stamp the current entry so popstate can
      // recognize close intent, and refresh the URL in case the climb resolved
      // a different slug than the one in the route.
      window.history.replaceState(stampedState, '', viewUrl);
    } else {
      window.history.pushState(stampedState, '', viewUrl);
    }

    const handlePopState = () => {
      // Any time the entry under us is no longer a /view/ URL, the drawer
      // should close. The drawer's own state update will trigger this
      // effect's cleanup, which is a no-op because the URL already moved.
      if (!window.location.pathname.includes('/view/')) {
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!window.location.pathname.includes('/view/')) {
        // popstate already navigated us off /view/ — nothing left to do.
        sourceRef.current = null;
        return;
      }
      // User-initiated close (close button, swipe-down, etc.). Restore the URL.
      const listUrl = withSearchParams(
        getListUrl(boardDetailsRef.current, angleRef.current, startPathname),
        searchParamsRef.current,
      );
      if (source === 'list-tap') {
        // Pop the entry we pushed when opening so back-button history stays clean.
        window.history.back();
      } else {
        // Direct hit — there is no entry we own to pop, and we must not push
        // either: pushing /list forward traps the user (Back from /list would
        // return them to /view/{uuid}, where the drawer is closed but the URL
        // says open). Replace the current entry instead so Back leaves the
        // tab/site cleanly.
        window.history.replaceState({ ...window.history.state }, '', listUrl);
      }
      sourceRef.current = null;
    };
    // The open effect should run only on the open/close transition. The
    // climb-change case (swipe / row-tap while open) is handled by the replace
    // effect below; if we included displayedClimb in this dep array the
    // cleanup would fire mid-open and `history.back()` would close the drawer
    // right after a row tap. pathname, searchParams, boardDetails and angle
    // changes are picked up through refs so the listener doesn't churn on
    // every keystroke in the search bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, enabled]);

  // While open, replace the URL when the displayed climb changes (swipe / prev / next).
  const lastSyncedUuidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !isOpen || !displayedClimb) {
      lastSyncedUuidRef.current = null;
      return;
    }
    if (lastSyncedUuidRef.current === displayedClimb.uuid) return;
    lastSyncedUuidRef.current = displayedClimb.uuid;

    // Only refresh the URL once we own the /view/ entry — the initial push is
    // handled by the open effect above.
    if (!window.location.pathname.includes('/view/')) return;

    const viewUrl = withSearchParams(
      getContextAwareClimbViewUrl(
        pathnameRef.current,
        boardDetailsRef.current,
        angleRef.current,
        displayedClimb.uuid,
        displayedClimb.name,
      ),
      searchParamsRef.current,
    );
    const stampedState = {
      ...window.history.state,
      boardseshDrawerUrlSync: {
        climbUuid: displayedClimb.uuid,
        source: sourceRef.current ?? 'list-tap',
      },
    };
    window.history.replaceState(stampedState, '', viewUrl);
  }, [displayedClimb, enabled, isOpen]);
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
