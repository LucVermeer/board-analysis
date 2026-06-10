export type NativeAuthFailureReason =
  | 'network'
  | 'invalid_credentials'
  | 'invalid_request'
  | 'rate_limited'
  | 'service_unavailable'
  | 'server_error'
  | 'invalid_transfer_token'
  | 'transfer_token_replay'
  | 'http_error'
  | 'exception';

// Which backend exchange produced the failure. A 401 means "invalid
// credentials" on /auth/native/credentials but "invalid or expired transfer
// token" on /auth/native/exchange — classify by the call site instead of
// string-matching server copy (which silently broke when the backend's 401
// body said 'Invalid email or password').
export type NativeAuthFailureSource = 'credentials' | 'exchange';

type NativeAuthFailure = { success: false; status: number | null; error: string };

export function classifyNativeAuthFailureReason(
  failure: NativeAuthFailure,
  source: NativeAuthFailureSource,
): NativeAuthFailureReason {
  if (failure.error === 'network') return 'network';
  if (failure.status === 400) return 'invalid_request';
  if (failure.status === 401) {
    return source === 'credentials' ? 'invalid_credentials' : 'invalid_transfer_token';
  }
  if (failure.status === 409) return 'transfer_token_replay';
  if (failure.status === 429) return 'rate_limited';
  if (failure.status === 503) return 'service_unavailable';
  if (failure.status != null && failure.status >= 500) return 'server_error';
  return 'http_error';
}
