import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLastUsedGrade } from '../use-last-used-grade';

const mockGetLastUsedGrade = vi.fn();
const mockSetLastUsedGrade = vi.fn();

vi.mock('@/app/lib/user-preferences-db', () => ({
  getLastUsedGrade: (...args: unknown[]) => mockGetLastUsedGrade(...args),
  setLastUsedGrade: (...args: unknown[]) => mockSetLastUsedGrade(...args),
}));

describe('useLastUsedGrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLastUsedGrade.mockResolvedValue(undefined);
    mockSetLastUsedGrade.mockResolvedValue(undefined);
  });

  it('initially returns lastUsedGrade=undefined before load resolves', () => {
    mockGetLastUsedGrade.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLastUsedGrade());

    expect(result.current.lastUsedGrade).toBeUndefined();
  });

  it('populates lastUsedGrade after the preference load resolves with a number', async () => {
    mockGetLastUsedGrade.mockResolvedValue(18);

    const { result } = renderHook(() => useLastUsedGrade());

    await waitFor(() => {
      expect(result.current.lastUsedGrade).toBe(18);
    });
  });

  it('stays undefined when the preference load resolves with undefined', async () => {
    mockGetLastUsedGrade.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLastUsedGrade());

    // Drain the microtask so the effect has a chance to run
    await waitFor(() => {
      expect(mockGetLastUsedGrade).toHaveBeenCalled();
    });

    expect(result.current.lastUsedGrade).toBeUndefined();
  });

  it('rememberGrade persists and updates the in-memory state', async () => {
    mockGetLastUsedGrade.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLastUsedGrade());

    await waitFor(() => {
      expect(mockGetLastUsedGrade).toHaveBeenCalled();
    });

    act(() => {
      result.current.rememberGrade(22);
    });

    expect(mockSetLastUsedGrade).toHaveBeenCalledWith(22);
    expect(result.current.lastUsedGrade).toBe(22);
  });

  it('rememberGrade is a no-op when called with undefined', async () => {
    mockGetLastUsedGrade.mockResolvedValue(15);

    const { result } = renderHook(() => useLastUsedGrade());

    await waitFor(() => {
      expect(result.current.lastUsedGrade).toBe(15);
    });

    act(() => {
      result.current.rememberGrade(undefined);
    });

    expect(mockSetLastUsedGrade).not.toHaveBeenCalled();
    expect(result.current.lastUsedGrade).toBe(15);
  });
});
