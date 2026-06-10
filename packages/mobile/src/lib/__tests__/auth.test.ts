import { describe, expect, it } from 'vitest';
import { classifyNativeAuthFailureReason } from '../native-auth-analytics';

describe('classifyNativeAuthFailureReason', () => {
  it('maps native credential and transfer failures to low-cardinality analytics reasons', () => {
    expect(classifyNativeAuthFailureReason({ success: false, status: null, error: 'network' }, 'credentials')).toBe(
      'network',
    );
    expect(
      classifyNativeAuthFailureReason(
        { success: false, status: 400, error: 'email and password are required' },
        'credentials',
      ),
    ).toBe('invalid_request');
    expect(
      classifyNativeAuthFailureReason(
        { success: false, status: 409, error: 'Transfer token has already been used' },
        'exchange',
      ),
    ).toBe('transfer_token_replay');
    expect(
      classifyNativeAuthFailureReason({ success: false, status: 429, error: 'Rate limit exceeded' }, 'exchange'),
    ).toBe('rate_limited');
    expect(
      classifyNativeAuthFailureReason(
        { success: false, status: 503, error: 'Service temporarily overloaded' },
        'exchange',
      ),
    ).toBe('service_unavailable');
    expect(
      classifyNativeAuthFailureReason({ success: false, status: 500, error: 'Internal server error' }, 'exchange'),
    ).toBe('server_error');
    expect(classifyNativeAuthFailureReason({ success: false, status: 418, error: 'teapot' }, 'exchange')).toBe(
      'http_error',
    );
  });

  // Regression: the classifier used to string-match the 401 body against
  // 'Invalid credentials', but the backend says 'Invalid email or password' —
  // every real wrong-password attempt was logged as invalid_transfer_token.
  it('classifies a 401 by which exchange failed, not by server copy', () => {
    expect(
      classifyNativeAuthFailureReason(
        { success: false, status: 401, error: 'Invalid email or password' },
        'credentials',
      ),
    ).toBe('invalid_credentials');
    expect(
      classifyNativeAuthFailureReason(
        { success: false, status: 401, error: 'Invalid or expired transfer token' },
        'exchange',
      ),
    ).toBe('invalid_transfer_token');
    // Even an unexpected body keeps the right bucket for its endpoint.
    expect(classifyNativeAuthFailureReason({ success: false, status: 401, error: 'Unauthorized' }, 'credentials')).toBe(
      'invalid_credentials',
    );
    expect(classifyNativeAuthFailureReason({ success: false, status: 401, error: 'Unauthorized' }, 'exchange')).toBe(
      'invalid_transfer_token',
    );
  });
});
