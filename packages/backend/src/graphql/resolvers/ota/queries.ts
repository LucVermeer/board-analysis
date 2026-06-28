import type { OtaPreviewChannel } from '@boardsesh/shared-schema';
import { logger } from '../../../utils/logger';
import { getLivePreviewChannels } from '../../../lib/ota-preview-channels';

export const otaQueries = {
  /**
   * Live per-PR OTA preview channels for the in-app channel switcher. Public —
   * no auth. Fail-soft: any GitHub error returns [] so the screen shows an empty
   * state rather than erroring (the source is a best-effort convenience, not
   * load-bearing data).
   */
  otaPreviewChannels: async (): Promise<OtaPreviewChannel[]> => {
    try {
      return await getLivePreviewChannels();
    } catch (error) {
      logger.warn(`[ota] otaPreviewChannels failed: ${String(error)}`);
      return [];
    }
  },
};
