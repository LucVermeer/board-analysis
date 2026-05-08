import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const storageMocks = vi.hoisted(() => ({
  getFromS3: vi.fn(),
  getS3ObjectMetadata: vi.fn(),
  isS3Configured: vi.fn(),
  uploadToS3: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  dbRead: {
    select: vi.fn(),
  },
}));

vi.mock('../storage/s3', () => storageMocks);
vi.mock('../db/client', () => dbMocks);

describe('user data export service', () => {
  beforeEach(() => {
    vi.resetModules();
    storageMocks.getFromS3.mockReset();
    storageMocks.getS3ObjectMetadata.mockReset();
    storageMocks.isS3Configured.mockReset();
    storageMocks.uploadToS3.mockReset();
    dbMocks.dbRead.select.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns a generic public error when export storage is unavailable', async () => {
    storageMocks.isS3Configured.mockReturnValue(false);

    const { getUserDataExportStatus } = await import('./user-data-export');

    await expect(getUserDataExportStatus('user-1', 'kilter')).resolves.toMatchObject({
      status: 'unavailable',
      error: 'Export service is temporarily unavailable.',
    });
  });

  it('does not expose raw generation errors in public export status', async () => {
    storageMocks.isS3Configured.mockReturnValue(true);
    storageMocks.getS3ObjectMetadata.mockResolvedValue(null);
    dbMocks.dbRead.select.mockImplementation(() => {
      throw new Error('database password leaked in stack trace');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getUserDataExportStatus, requestUserDataExport } = await import('./user-data-export');

    await expect(requestUserDataExport('user-2', 'kilter')).resolves.toMatchObject({
      status: 'generating',
    });

    await vi.waitFor(async () => {
      await expect(getUserDataExportStatus('user-2', 'kilter')).resolves.toMatchObject({
        status: 'failed',
        error: 'Export generation failed. Try again later.',
      });
    });
    await expect(getUserDataExportStatus('user-2', 'kilter')).resolves.not.toMatchObject({
      error: expect.stringContaining('database password'),
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it('evicts stale cached export jobs before serving status', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    storageMocks.isS3Configured.mockReturnValue(true);
    storageMocks.getS3ObjectMetadata
      .mockResolvedValueOnce({
        lastModified: new Date('2026-05-01T00:00:00Z'),
        contentLength: 123,
      })
      .mockResolvedValue(null);

    const { getUserDataExportStatus } = await import('./user-data-export');

    await expect(getUserDataExportStatus('user-3', 'kilter')).resolves.toMatchObject({
      status: 'ready',
      fileSize: 123,
    });

    nowSpy.mockReturnValue(8 * 24 * 60 * 60 * 1000 + 1);

    await expect(getUserDataExportStatus('user-3', 'kilter')).resolves.toMatchObject({
      status: 'not_requested',
    });
    expect(storageMocks.getS3ObjectMetadata).toHaveBeenCalledTimes(2);
  });
});
