import { describe, expect, it } from 'vitest';
import { classifyNativeAuthFailureReason } from '../native-auth-analytics';

describe('classifyNativeAuthFailureReason', () => {
  it('maps native credential and transfer failures to low-cardinality analytics reasons', () => {
    expect(classifyNativeAuthFailureReason({ success: false, status: null, error: 'network' })).toBe('network');
    expect(
      classifyNativeAuthFailureReason({ success: false, status: 400, error: 'email and password are required' }),
    ).toBe('invalid_request');
    expect(classifyNativeAuthFailureReason({ success: false, status: 401, error: 'Invalid credentials' })).toBe(
      'invalid_credentials',
    );
    expect(
      classifyNativeAuthFailureReason({ success: false, status: 401, error: 'Invalid or expired transfer token' }),
    ).toBe('invalid_transfer_token');
    expect(
      classifyNativeAuthFailureReason({ success: false, status: 409, error: 'Transfer token has already been used' }),
    ).toBe('transfer_token_replay');
    expect(classifyNativeAuthFailureReason({ success: false, status: 429, error: 'Rate limit exceeded' })).toBe(
      'rate_limited',
    );
    expect(
      classifyNativeAuthFailureReason({ success: false, status: 503, error: 'Service temporarily overloaded' }),
    ).toBe('service_unavailable');
    expect(classifyNativeAuthFailureReason({ success: false, status: 500, error: 'Internal server error' })).toBe(
      'server_error',
    );
    expect(classifyNativeAuthFailureReason({ success: false, status: 418, error: 'teapot' })).toBe('http_error');
  });
});
