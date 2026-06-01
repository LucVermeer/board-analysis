/**
 * DrawerHostProvider mounts PlayDrawer and LogAscentSheet once at the app root
 * and exposes imperative openers via `useDrawerHost()`. This lets the
 * persistent queue control bar (and any screen) open them without each tab
 * having to instantiate its own copy.
 *
 * Default board comes from `useActiveBoard()` (the user's stored pick); callers
 * can override via the second arg to `openPlayDrawer` if needed (e.g. opening a
 * climb from a different board context). The active boardConfig is exposed
 * through the context so consumers (like the persistent bar's log-ascent
 * button) don't have to resolve the active board independently.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/shared-schema';
import { PlayDrawer, type PlayDrawerHandle, type PlayDrawerOpenOptions } from '../components/play-drawer';
import { LogAscentSheet } from '../components/LogAscentSheet';
import { useActiveBoard } from '../lib/graphql/use-active-board';

export type BoardConfig = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

export type LogAscentInput = {
  climbUuid: string;
  climbName: string;
  boardName: string;
  angle: number;
  isMirror: boolean;
  isBenchmark: boolean;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  sessionId?: string | null;
};

export type OpenPlayDrawerOptions = PlayDrawerOpenOptions & {
  /** Switch the drawer to a different board config before opening (e.g. the
   *  caller is opening a climb that belongs to a board other than the user's
   *  default). The override is applied via state, so the actual open happens
   *  after the new boardConfig has propagated to PlayDrawer's props. */
  boardConfig?: BoardConfig;
};

type DrawerHostValue = {
  /** Currently resolved board config (override OR default board). Null while
   *  the default board is still loading and no override is set. */
  boardConfig: BoardConfig | null;
  openPlayDrawer: (climb: Climb, options?: OpenPlayDrawerOptions) => void;
  openLogAscent: (input: LogAscentInput) => void;
};

const DrawerHostContext = createContext<DrawerHostValue | null>(null);

export function useDrawerHost(): DrawerHostValue {
  const context = useContext(DrawerHostContext);
  if (!context) throw new Error('useDrawerHost must be used within DrawerHostProvider');
  return context;
}

export function DrawerHostProvider({ children }: { children: ReactNode }) {
  const playDrawerRef = useRef<PlayDrawerHandle>(null);
  const { data: activeBoard } = useActiveBoard();
  const [boardConfigOverride, setBoardConfigOverride] = useState<BoardConfig | null>(null);
  const [logAscentInput, setLogAscentInput] = useState<LogAscentInput | null>(null);

  // Climb to open after the boardConfig override has committed. We can't
  // open synchronously inside openPlayDrawer when an override is supplied
  // because the new override hasn't propagated to PlayDrawer's `boardConfig`
  // prop yet — a single requestAnimationFrame is unreliable on low-end
  // Android. Stash the climb (plus the caller's open options) here and let
  // the useEffect below open the drawer when activeBoardConfig actually
  // matches the override.
  const pendingOverrideOpenRef = useRef<{ climb: Climb; options: PlayDrawerOpenOptions } | null>(null);

  const activeBoardConfig: BoardConfig | null = useMemo(() => {
    if (boardConfigOverride) return boardConfigOverride;
    if (!activeBoard) return null;
    return {
      boardName: activeBoard.boardType,
      layoutId: activeBoard.layoutId,
      sizeId: activeBoard.sizeId,
      setIds: activeBoard.setIds,
      angle: activeBoard.angle,
    };
  }, [boardConfigOverride, activeBoard]);

  const openPlayDrawer = useCallback((climb: Climb, options?: OpenPlayDrawerOptions) => {
    const { boardConfig: override, ...openOptions } = options ?? {};
    if (override) {
      pendingOverrideOpenRef.current = { climb, options: openOptions };
      setBoardConfigOverride(override);
      return;
    }
    setBoardConfigOverride(null);
    pendingOverrideOpenRef.current = null;
    playDrawerRef.current?.open(climb, openOptions);
  }, []);

  // Open after the override has flowed through `activeBoardConfig` into
  // PlayDrawer's props.
  useEffect(() => {
    if (!pendingOverrideOpenRef.current) return;
    if (!activeBoardConfig) return;
    const { climb, options } = pendingOverrideOpenRef.current;
    pendingOverrideOpenRef.current = null;
    playDrawerRef.current?.open(climb, options);
  }, [activeBoardConfig]);

  const openLogAscent = useCallback((input: LogAscentInput) => {
    setLogAscentInput(input);
  }, []);

  const dismissLogAscent = useCallback(() => setLogAscentInput(null), []);

  const value = useMemo<DrawerHostValue>(
    () => ({ boardConfig: activeBoardConfig, openPlayDrawer, openLogAscent }),
    [activeBoardConfig, openPlayDrawer, openLogAscent],
  );

  return (
    <DrawerHostContext.Provider value={value}>
      {children}
      {activeBoardConfig ? <PlayDrawer ref={playDrawerRef} boardConfig={activeBoardConfig} /> : null}
      {logAscentInput ? (
        <LogAscentSheet
          visible
          onDismiss={dismissLogAscent}
          climbUuid={logAscentInput.climbUuid}
          climbName={logAscentInput.climbName}
          boardName={logAscentInput.boardName}
          angle={logAscentInput.angle}
          isMirror={logAscentInput.isMirror}
          isBenchmark={logAscentInput.isBenchmark}
          layoutId={logAscentInput.layoutId}
          sizeId={logAscentInput.sizeId}
          setIds={logAscentInput.setIds}
          sessionId={logAscentInput.sessionId}
        />
      ) : null}
    </DrawerHostContext.Provider>
  );
}
