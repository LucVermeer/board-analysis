import { describe, it, expect, vi } from 'vitest';
import { performOtaRecovery, type OtaRecoveryDeps } from '../ota-recovery';

function makeDeps(overrides: Partial<OtaRecoveryDeps> = {}): OtaRecoveryDeps {
  return {
    checkForUpdate: vi.fn().mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false }),
    fetchUpdate: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    isUpdatePending: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

describe('performOtaRecovery', () => {
  it('update available: fetches, reloads, tracks the outcome BEFORE reload → reloaded-update', async () => {
    const deps = makeDeps();
    const onBeforeReload = vi.fn();
    const { result } = await performOtaRecovery(deps, { onBeforeReload });

    expect(result).toBe('reloaded-update');
    expect(deps.fetchUpdate).toHaveBeenCalledOnce();
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(onBeforeReload).toHaveBeenCalledWith('reloaded-update');
    // The outcome must be emitted before the reload is initiated, or the restart
    // can tear the app down before the event is delivered.
    const reloadMock = deps.reload as ReturnType<typeof vi.fn>;
    expect(onBeforeReload.mock.invocationCallOrder[0]).toBeLessThan(reloadMock.mock.invocationCallOrder[0]);
  });

  it('reports phases in order: checking then downloading', async () => {
    const deps = makeDeps();
    const onPhase = vi.fn();
    await performOtaRecovery(deps, { onPhase });

    expect(onPhase.mock.calls.map((call) => call[0])).toEqual(['checking', 'downloading']);
  });

  it('rollback directive (no newer update): fetches, reloads → reloaded-rollback', async () => {
    const deps = makeDeps({
      checkForUpdate: vi.fn().mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: true }),
    });
    const onBeforeReload = vi.fn();
    const { result } = await performOtaRecovery(deps, { onBeforeReload });

    expect(result).toBe('reloaded-rollback');
    expect(deps.fetchUpdate).toHaveBeenCalledOnce();
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(onBeforeReload).toHaveBeenCalledWith('reloaded-rollback');
  });

  it('nothing on the server but an update is pending: reloads WITHOUT fetching → reloaded-pending', async () => {
    const deps = makeDeps({
      checkForUpdate: vi.fn().mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: false }),
      isUpdatePending: vi.fn().mockReturnValue(true),
    });
    const onBeforeReload = vi.fn();
    const { result } = await performOtaRecovery(deps, { onBeforeReload });

    expect(result).toBe('reloaded-pending');
    expect(deps.fetchUpdate).not.toHaveBeenCalled();
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(onBeforeReload).toHaveBeenCalledWith('reloaded-pending');
  });

  it('nothing new and nothing pending: does NOT reload → no-fix-available', async () => {
    const deps = makeDeps({
      checkForUpdate: vi.fn().mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: false }),
      isUpdatePending: vi.fn().mockReturnValue(false),
    });
    const { result } = await performOtaRecovery(deps);

    expect(result).toBe('no-fix-available');
    expect(deps.fetchUpdate).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('checkForUpdate rejects: captures the error, never reloads → failed', async () => {
    const checkError = new Error('offline');
    const deps = makeDeps({ checkForUpdate: vi.fn().mockRejectedValue(checkError) });
    const { result, error } = await performOtaRecovery(deps);

    expect(result).toBe('failed');
    expect(error).toBe(checkError);
    expect(deps.fetchUpdate).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('fetch rejects after the check found an update: captures the error, never reloads → failed', async () => {
    const fetchError = new Error('download interrupted');
    const deps = makeDeps({ fetchUpdate: vi.fn().mockRejectedValue(fetchError) });
    const onBeforeReload = vi.fn();
    const { result, error } = await performOtaRecovery(deps, { onBeforeReload });

    expect(result).toBe('failed');
    expect(error).toBe(fetchError);
    expect(deps.fetchUpdate).toHaveBeenCalledOnce();
    expect(deps.reload).not.toHaveBeenCalled();
    expect(onBeforeReload).not.toHaveBeenCalled();
  });

  it('reload rejects: the machine catches it rather than leaking → failed', async () => {
    const reloadError = new Error('reload blew up');
    const deps = makeDeps({ reload: vi.fn().mockRejectedValue(reloadError) });
    const { result, error } = await performOtaRecovery(deps);

    expect(result).toBe('failed');
    expect(error).toBe(reloadError);
    expect(deps.reload).toHaveBeenCalledOnce();
  });

  it('fetch hangs past the timeout: resolves failed, never reloads', async () => {
    const deps = makeDeps({
      // Never resolves — stands in for a stalled download.
      fetchUpdate: vi.fn().mockReturnValue(new Promise(() => {})),
      timeoutMs: 10,
    });
    const { result } = await performOtaRecovery(deps);

    expect(result).toBe('failed');
    expect(deps.reload).not.toHaveBeenCalled();
  });
});
