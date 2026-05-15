/**
 * Tests for the APNs stale-token cleanup sweep.
 *
 * Verifies:
 * - Skips when APNs is not configured.
 * - Issues a DELETE filtered by `updated_at < cutoff`.
 * - Increments tokensSweptStale by the number of deleted rows.
 * - Skips the metric increment when nothing was deleted.
 * - Logs and swallows DB errors without throwing.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vite-plus/test';
import { logger } from '../utils/logger';

const deleteReturningMock = vi.fn<() => Promise<Array<{ token: string }>>>(async () => []);
const deleteWhereMock = vi.fn(() => ({ returning: deleteReturningMock }));

vi.mock('../db/client', () => ({
  db: {
    delete: vi.fn(() => ({ where: deleteWhereMock })),
  },
}));

const isApnsConfiguredMock = vi.fn<() => boolean>(() => true);
const incrementApnsMetricMock = vi.fn<(key: string, delta?: number) => void>();

vi.mock('../services/apns', () => ({
  isApnsConfigured: () => isApnsConfiguredMock(),
  incrementApnsMetric: (key: string, delta?: number) => incrementApnsMetricMock(key, delta),
}));

const { __runCleanupTickForTests } = await import('../services/apns/cleanup');

const loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

afterAll(() => {
  loggerInfoSpy.mockRestore();
  loggerErrorSpy.mockRestore();
});

describe('runCleanupTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isApnsConfiguredMock.mockReturnValue(true);
    deleteReturningMock.mockResolvedValue([]);
  });

  it('skips entirely when APNs is not configured', async () => {
    isApnsConfiguredMock.mockReturnValue(false);

    await __runCleanupTickForTests();

    expect(deleteWhereMock).not.toHaveBeenCalled();
    expect(incrementApnsMetricMock).not.toHaveBeenCalled();
  });

  it('issues the delete and does not bump the metric when nothing was stale', async () => {
    deleteReturningMock.mockResolvedValue([]);

    await __runCleanupTickForTests();

    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
    expect(incrementApnsMetricMock).not.toHaveBeenCalled();
  });

  it('increments the metric by the number of deleted rows', async () => {
    deleteReturningMock.mockResolvedValue([
      { token: 'a'.repeat(64) },
      { token: 'b'.repeat(64) },
      { token: 'c'.repeat(64) },
    ]);

    await __runCleanupTickForTests();

    expect(incrementApnsMetricMock).toHaveBeenCalledWith('tokensSweptStale', 3);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[APNs Cleanup] Removed 3 push token(s) untouched since'),
    );
  });

  it('swallows DB errors without throwing', async () => {
    const boom = new Error('connection refused');
    deleteReturningMock.mockRejectedValue(boom);

    await expect(__runCleanupTickForTests()).resolves.toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalledWith('[APNs Cleanup] Failed to remove stale tokens:', boom);
    expect(incrementApnsMetricMock).not.toHaveBeenCalled();
  });
});
