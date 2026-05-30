import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

interface DevNetworkingPlugin {
  applyBoardseshDevNetworkingInfoPlist(infoPlist: Record<string, unknown>): Record<string, unknown>;
  TAILSCALE_ATS_EXCEPTION: Record<string, unknown>;
  TAILSCALE_DOMAIN: string;
}

const devNetworkingPlugin = require('../../../plugins/with-boardsesh-dev-networking.js') as DevNetworkingPlugin;

describe('with-boardsesh-dev-networking', () => {
  it('adds a Tailscale MagicDNS ATS exception without enabling arbitrary loads', () => {
    const infoPlist = devNetworkingPlugin.applyBoardseshDevNetworkingInfoPlist({
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: {
          'example.com': {
            NSIncludesSubdomains: true,
          },
        },
      },
    });

    expect(infoPlist.NSAppTransportSecurity).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        'example.com': {
          NSIncludesSubdomains: true,
        },
        [devNetworkingPlugin.TAILSCALE_DOMAIN]: devNetworkingPlugin.TAILSCALE_ATS_EXCEPTION,
      },
    });
  });
});
