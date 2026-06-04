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

type NativeAuthFailure = { success: false; status: number | null; error: string };

export function classifyNativeAuthFailureReason(failure: NativeAuthFailure): NativeAuthFailureReason {
  if (failure.error === 'network') return 'network';
  if (failure.status === 400) return 'invalid_request';
  if (failure.status === 401) {
    return failure.error === 'Invalid credentials' ? 'invalid_credentials' : 'invalid_transfer_token';
  }
  if (failure.status === 409) return 'transfer_token_replay';
  if (failure.status === 429) return 'rate_limited';
  if (failure.status === 503) return 'service_unavailable';
  if (failure.status != null && failure.status >= 500) return 'server_error';
  return 'http_error';
}
