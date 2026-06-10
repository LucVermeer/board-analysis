// Parses OAuth callback deep links (com.boardsesh.app://...?...) that
// openAuthSessionAsync hands back when the in-app browser redirects.
// Deliberately avoids `new URL().searchParams` (incomplete under Hermes) and
// expo-linking (native imports break node-env unit tests).
export function parseDeepLinkQueryParams(url: string): Map<string, string> {
  const params = new Map<string, string>();
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return params;
  }

  const hashIndex = url.indexOf('#', queryIndex);
  const queryString = url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);

  for (const pair of queryString.split('&')) {
    if (!pair) continue;
    const equalsIndex = pair.indexOf('=');
    const rawKey = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
    const rawValue = equalsIndex === -1 ? '' : pair.slice(equalsIndex + 1);
    try {
      params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue.replace(/\+/g, ' ')));
    } catch {
      // Malformed percent-encoding — skip the pair rather than fail the flow.
    }
  }

  return params;
}

export function parseAuthCallbackParams(url: string): { transferToken: string | null; error: string | null } {
  const params = parseDeepLinkQueryParams(url);
  return {
    transferToken: params.get('transferToken') ?? null,
    error: params.get('error') ?? null,
  };
}
