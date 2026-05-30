const { createRunOncePlugin, withInfoPlist } = require('expo/config-plugins');

const TAILSCALE_DOMAIN = 'ts.net';
// Metro serves over plain HTTP, so the insecure-loads exception is what
// actually unlocks the connection. TLS minimum version is intentionally
// omitted — Tailscale itself encrypts at the WireGuard layer, iOS never
// negotiates TLS to `*.ts.net`, and shipping an explicit `TLSv1.0` floor
// is the kind of value App Store reviewers flag.
const TAILSCALE_ATS_EXCEPTION = {
  NSIncludesSubdomains: true,
  NSExceptionAllowsInsecureHTTPLoads: true,
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
    // Non-clobbering: preserve any upstream value (Expo defaults, other
    // plugins) and only fall back to our defaults when unset.
    NSAllowsArbitraryLoads: appTransportSecurity.NSAllowsArbitraryLoads ?? false,
    NSAllowsLocalNetworking: appTransportSecurity.NSAllowsLocalNetworking ?? true,
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
