// Injected platform I/O for the board-presence React hook.
//
// This package never imports a GraphQL client (it must stay renderer-agnostic
// and platform-free), so the consumer supplies a `BoardPresenceClient` that
// wires the actual transport — graphql-ws on web/mobile, or a fake in tests.
// The hook only sees these five methods.

import type {
  BoardConnectionHolder,
  BoardPresenceClimb,
  BoardPresenceEvent,
  BoardPresenceStats,
  ClimbQueueItemInput,
  ResolvedBoard,
} from '@boardsesh/shared-schema';

export interface BoardPresenceClient {
  /**
   * Subscribe to a board's live "now on the wall" feed. Each event is one
   * `BoardPresenceEvent` (set or cleared). Returns an unsubscribe function the
   * hook calls on board change / unmount. `onError` (optional) reports a
   * transport-level failure without tearing down the hook's state.
   */
  subscribeNowPlaying(
    boardId: number,
    onEvent: (event: BoardPresenceEvent) => void,
    onError?: (err: unknown) => void,
    onComplete?: () => void,
  ): () => void;

  /** Newest-first recent climbs, used to backfill history for a late joiner. */
  fetchRecentClimbs(boardId: number): Promise<BoardPresenceClimb[]>;

  /** Durable + live stats for the board's wall feed. */
  fetchStats(boardId: number): Promise<BoardPresenceStats>;

  /**
   * Current connection holder for the board, used to seed a late joiner before
   * any live `BoardConnectionChanged` push lands. Resolves to `null` when the
   * board is free. Optional so a client that doesn't track holders still
   * satisfies the interface.
   */
  fetchConnection?(boardId: number): Promise<BoardConnectionHolder | null>;

  /**
   * Release this client's hold on the board (e.g. on BLE disconnect). Resolves
   * to the server's accepted flag. Optional so a read-only client still
   * satisfies the interface.
   */
  reportDisconnect?(boardId: number): Promise<boolean>;

  /**
   * Report the climb just lit on the wall. `angle` is the wall angle (null =
   * unspecified). Resolves to the server's accepted flag.
   */
  reportClimb(boardId: number, climb: ClimbQueueItemInput, angle: number | null): Promise<boolean>;

  /** Resolve (and bind) the shared board for a BLE serial. */
  resolveBoardForSerial(args: {
    serial: string;
    boardType: string;
    layoutId: number;
    sizeId: number;
    setIds: string;
  }): Promise<ResolvedBoard>;

  /** Resolve the selected named board's wall feed before BLE connects. */
  resolveBoardForUuid?(args: { boardUuid: string }): Promise<ResolvedBoard>;

  /**
   * Resolve the shared board by configuration when the BLE controller exposes no
   * serial. Aurora boards should use `resolveBoardForSerial`; serial-less boards
   * like MoonBoard use this per-config fallback when the backend supports it.
   */
  resolveBoardForConfig?(args: {
    boardType: string;
    layoutId: number;
    sizeId: number;
    setIds: string;
  }): Promise<ResolvedBoard>;
}
