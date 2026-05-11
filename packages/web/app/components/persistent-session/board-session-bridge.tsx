'use client';

import React, { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { usePersistentSessionState, usePersistentSessionActions } from './persistent-session-context';
import type { BoardDetails, ParsedBoardRouteParameters } from '@/app/lib/types';
import { getBaseBoardPath } from '@/app/lib/url-utils';
import { getClimbSessionCookie } from '@/app/lib/climb-session-cookie';
import { track } from '@/app/lib/analytics';

type BoardSessionBridgeProps = {
  boardDetails: BoardDetails;
  parsedParams: ParsedBoardRouteParameters;
  children: React.ReactNode;
};

/**
 * Bridge component that connects the board layout to the persistent session.
 * This component activates the session when mounted on a board page with a session param.
 */
const BoardSessionBridge: React.FC<BoardSessionBridgeProps> = ({ boardDetails, parsedParams, children }) => {
  const pathname = usePathname();
  const sessionIdFromCookie = getClimbSessionCookie();

  const { activeSession } = usePersistentSessionState();
  const { activateSession } = usePersistentSessionActions();

  // Compute the base board path (without /play/[uuid] or /list segments)
  // This ensures navigation between climbs doesn't trigger session reconnection
  const baseBoardPath = useMemo(() => getBaseBoardPath(pathname), [pathname]);

  // Refs to hold stable references to boardDetails and parsedParams
  // These values change reference on every render but we only need their current values
  const boardDetailsRef = React.useRef(boardDetails);
  const parsedParamsRef = React.useRef(parsedParams);
  boardDetailsRef.current = boardDetails;
  parsedParamsRef.current = parsedParams;

  // Activate or update session when we have a session param and board details
  // This effect handles:
  // 1. Initial session activation when joining via shared link
  // 2. Updates when board configuration changes (e.g., angle change) while session remains active
  // Note: Navigation within the same board (e.g., swiping between climbs) should NOT trigger reconnection
  useEffect(() => {
    if (sessionIdFromCookie && boardDetailsRef.current) {
      // Activate session when URL has session param and either:
      // - Session ID changed
      // - Board configuration path changed (e.g., navigating to different board/layout/size/sets)
      // Note: We compare baseBoardPaths to ignore changes to angle, /play/[uuid], /list segments
      // This ensures session continuity when navigating between climbs or changing angles
      const activeSessionBasePath = activeSession?.boardPath ? getBaseBoardPath(activeSession.boardPath) : '';
      if (activeSession?.sessionId !== sessionIdFromCookie || activeSessionBasePath !== baseBoardPath) {
        // Fire Session Joined only on a genuine new-session entry (cookie path —
        // link, QR, resume from history). Hosts create via start-sesh-drawer
        // which calls activateSession before this bridge mounts, so they're
        // already on the matching session and skip this branch. Board reconfig
        // within the same session also skips.
        if (activeSession?.sessionId !== sessionIdFromCookie) {
          track('Session Joined', {
            session_id: sessionIdFromCookie,
            board_name: boardDetailsRef.current.board_name,
            layout_id: boardDetailsRef.current.layout_id,
          });
        }
        // Store the full pathname (including angle and view segment like /list)
        // This allows the /join redirect to send users to the exact page with angle
        activateSession({
          sessionId: sessionIdFromCookie,
          boardPath: pathname,
          boardDetails: boardDetailsRef.current,
          parsedParams: parsedParamsRef.current,
        });
      }
    }
    // Don't deactivate when URL param is missing - only explicit endSession() should disconnect
    // The session connection persists even if URL param is temporarily removed
  }, [
    sessionIdFromCookie,
    baseBoardPath,
    pathname,
    // boardDetails and parsedParams removed - accessed via refs to prevent unnecessary reconnections
    // Their object references change on every render but the actual values don't affect session activation
    activeSession?.sessionId,
    activeSession?.boardPath,
    activateSession,
  ]);

  return children;
};

export default BoardSessionBridge;
