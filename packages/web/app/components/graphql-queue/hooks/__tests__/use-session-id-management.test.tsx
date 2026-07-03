import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { useSessionIdManagement } from '../use-session-id-management';

// --- Cookie (non-reactive document.cookie) — mocked with a module-level mirror ---
let mockCookie: string | null = null;
const mockSetCookie = vi.fn((value: string) => {
  mockCookie = value;
});
const mockClearCookie = vi.fn(() => {
  mockCookie = null;
});
vi.mock('@/app/lib/climb-session-cookie', () => ({
  getClimbSessionCookie: () => mockCookie,
  setClimbSessionCookie: (value: string) => mockSetCookie(value),
  clearClimbSessionCookie: () => mockClearCookie(),
}));

// --- Routing ---
let mockSearchParams = new URLSearchParams();
let mockPathname = '/kilter/8/5/12/40';
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
}));
vi.mock('@/app/lib/i18n/use-locale-router', () => ({
  useLocaleRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
}));

// --- Persistent session (root) ---
type MockActiveSession = {
  sessionId: string;
  boardPath: string;
  parsedParams?: { board_name?: string };
} | null;
let mockActiveSession: MockActiveSession = null;
const mockEndSessionWithSummary = vi.fn();
const mockDeactivateSession = vi.fn();
const mockSetInitialQueueForSession = vi.fn();
vi.mock('@/app/components/persistent-session', () => ({
  usePersistentSession: () => ({
    activeSession: mockActiveSession,
    endSessionWithSummary: mockEndSessionWithSummary,
    deactivateSession: mockDeactivateSession,
    setInitialQueueForSession: mockSetInitialQueueForSession,
  }),
}));

vi.mock('@/app/components/connection-manager/connection-settings-context', () => ({
  useConnectionSettings: () => ({ backendUrl: 'wss://backend.test' }),
}));

const mockEmitSessionEnded = vi.fn();
vi.mock('@/app/lib/session-lifecycle-tracking', () => ({
  emitSessionEnded: (...args: unknown[]) => mockEmitSessionEnded(...args),
}));

vi.mock('@/app/lib/session-history-db', () => ({
  saveSessionToHistory: vi.fn(async () => {}),
}));

function renderSessionId(params?: { isOffBoardMode?: boolean; propsBaseBoardPath?: string }) {
  return renderHook(() =>
    useSessionIdManagement({
      isOffBoardMode: params?.isOffBoardMode ?? false,
      propsBaseBoardPath: params?.propsBaseBoardPath,
      currentQueue: [],
      currentClimbQueueItem: null,
    }),
  );
}

describe('useSessionIdManagement — session id derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookie = null;
    mockSearchParams = new URLSearchParams();
    mockPathname = '/kilter/8/5/12/40';
    mockActiveSession = null;
  });

  it('board route: derives the id from the cookie when no persistent session exists', () => {
    mockCookie = 'cookie-sess';
    const { result } = renderSessionId();
    expect(result.current.sessionId).toBe('cookie-sess');
    expect(result.current.isPersistentSessionActive).toBe(false);
  });

  it('off-board: derives the id from the persistent session and ignores the cookie', () => {
    mockCookie = 'stale-cookie';
    mockActiveSession = { sessionId: 'persist-sess', boardPath: '/kilter/8/5/12/40' };
    const { result } = renderSessionId({ isOffBoardMode: true, propsBaseBoardPath: '/kilter/8/5/12' });
    expect(result.current.sessionId).toBe('persist-sess');
  });

  it('board route: adopts the persistent session id when its board matches the route', () => {
    mockCookie = 'persist-sess';
    mockActiveSession = { sessionId: 'persist-sess', boardPath: '/kilter/8/5/12/40' };
    const { result } = renderSessionId();
    expect(result.current.sessionId).toBe('persist-sess');
    expect(result.current.isPersistentSessionActive).toBe(true);
  });

  it('board route: does NOT leak a different board’s persistent session id (multi-session restore race)', () => {
    // Session for a kilter board is held in IndexedDB while the user browses a
    // tension board that has its own cookie. The derivation must read the
    // tension cookie, not the foreign kilter session id.
    mockPathname = '/tension/1/2/3/40';
    mockCookie = 'tension-cookie-sess';
    mockActiveSession = { sessionId: 'kilter-board-sess', boardPath: '/kilter/8/5/12/40' };
    const { result } = renderSessionId();
    expect(result.current.sessionId).toBe('tension-cookie-sess');
    expect(result.current.isPersistentSessionActive).toBe(false);
  });

  it('board route: does NOT adopt a persistent session that has no boardPath (falls back to the cookie)', () => {
    // A malformed/boardless active session must match NOTHING — the strict match
    // (activeSessionBoardPath === baseBoardPath) makes its null board path fail
    // for every route, so the derivation reads the cookie rather than adopting it.
    mockCookie = 'cookie-sess';
    mockActiveSession = { sessionId: 'boardless-sess', boardPath: '' };
    const { result } = renderSessionId();
    expect(result.current.sessionId).toBe('cookie-sess');
    expect(result.current.isPersistentSessionActive).toBe(false);
  });

  it('board route: keeps reading the cookie during the IndexedDB-load window (persistent id briefly null)', () => {
    mockCookie = 'cookie-sess';
    mockActiveSession = null; // restore not yet complete
    const { result } = renderSessionId();
    expect(result.current.sessionId).toBe('cookie-sess');
  });

  it('migrates a legacy ?session= param to the cookie and strips it from the URL', () => {
    mockSearchParams = new URLSearchParams('session=migrated-sess&foo=bar');
    const { result } = renderSessionId();
    expect(mockSetCookie).toHaveBeenCalledWith('migrated-sess');
    expect(result.current.sessionId).toBe('migrated-sess');
    expect(mockRouterReplace).toHaveBeenCalledWith('/kilter/8/5/12/40?foo=bar', { scroll: false });
  });

  it('clears the cookie mirror when the persistent session is deactivated externally (active→null)', () => {
    mockCookie = 'persist-sess';
    mockActiveSession = { sessionId: 'persist-sess', boardPath: '/kilter/8/5/12/40' };
    const { result, rerender } = renderSessionId();
    expect(result.current.sessionId).toBe('persist-sess');

    // External deactivation (e.g. the sesh-settings drawer's stop).
    mockActiveSession = null;
    rerender();

    expect(mockClearCookie).toHaveBeenCalled();
    expect(result.current.sessionId).toBeNull();
  });
});

describe('useSessionIdManagement — endSession routes through the root summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookie = null;
    mockSearchParams = new URLSearchParams();
    mockPathname = '/kilter/8/5/12/40';
    mockActiveSession = null;
  });

  it('emits user_left, clears the cookie, and delegates to endSessionWithSummary with board type', () => {
    mockCookie = 'persist-sess';
    mockActiveSession = {
      sessionId: 'persist-sess',
      boardPath: '/kilter/8/5/12/40',
      parsedParams: { board_name: 'kilter' },
    };
    const { result } = renderSessionId();

    act(() => {
      result.current.endSession();
    });

    expect(mockEmitSessionEnded).toHaveBeenCalledWith('persist-sess', 'user_left');
    expect(mockClearCookie).toHaveBeenCalled();
    expect(mockEndSessionWithSummary).toHaveBeenCalledWith({ sessionId: 'persist-sess', boardType: 'kilter' });
    // The root owns deactivation now (endSessionWithSummary calls it) — the hook
    // no longer deactivates directly.
    expect(mockDeactivateSession).not.toHaveBeenCalled();
  });

  it('cookie-only edge case: passes the cookie id and a path-derived board type when no session was activated', () => {
    // Cookie holds a session BoardSessionBridge never activated, so there is no
    // active persistent session to read the id/board type from.
    mockPathname = '/tension/1/2/3/40';
    mockCookie = 'cookie-only-sess';
    mockActiveSession = null;
    const { result } = renderSessionId();

    act(() => {
      result.current.endSession();
    });

    expect(mockEndSessionWithSummary).toHaveBeenCalledWith({ sessionId: 'cookie-only-sess', boardType: 'tension' });
  });
});
