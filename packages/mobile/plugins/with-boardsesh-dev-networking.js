const { createRunOncePlugin, withInfoPlist } = require('expo/config-plugins');

const TAILSCALE_DOMAIN = 'ts.net';
const TAILSCALE_ATS_EXCEPTION = {
  NSIncludesSubdomains: true,
  NSExceptionAllowsInsecureHTTPLoads: true,
  NSExceptionMinimumTLSVersion: 'TLSv1.0',
};

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyBoardseshDevNetworkingInfoPlist(infoPlist) {
  const appTransportSecurity = isRecord(infoPlist.NSAppTransportSecurity) ? infoPlist.NSAppTransportSecurity : {};
  const exceptionDomains = isRecord(appTransportSecurity.NSExceptionDomains)
    ? appTransportSecurity.NSExceptionDomains
    : {};

  infoPlist.NSAppTransportSecurity = {
    ...appTransportSecurity,
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: {
      ...exceptionDomains,
      [TAILSCALE_DOMAIN]: {
        ...(isRecord(exceptionDomains[TAILSCALE_DOMAIN]) ? exceptionDomains[TAILSCALE_DOMAIN] : {}),
        ...TAILSCALE_ATS_EXCEPTION,
      },
    },
  };

  return infoPlist;
}

function withBoardseshDevNetworking(config) {
  return withInfoPlist(config, (modConfig) => {
    applyBoardseshDevNetworkingInfoPlist(modConfig.modResults);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withBoardseshDevNetworking, 'with-boardsesh-dev-networking', '1.0.0');
module.exports.applyBoardseshDevNetworkingInfoPlist = applyBoardseshDevNetworkingInfoPlist;
module.exports.TAILSCALE_ATS_EXCEPTION = TAILSCALE_ATS_EXCEPTION;
module.exports.TAILSCALE_DOMAIN = TAILSCALE_DOMAIN;
