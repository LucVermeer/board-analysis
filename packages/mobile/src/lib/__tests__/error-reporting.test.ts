import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError, reportHandledError } from '../error-reporting';
import { captureError } from '../posthog-client';

// captureError is the only side-effecting dependency; mocking it keeps this a
// pure test of the noise policy (and avoids posthog-client's import-time global
// error-capture install).
vi.mock('../posthog-client', () => ({
  captureError: vi.fn(),
}));

const mockedCaptureError = vi.mocked(captureError);

afterEach(() => {
  mockedCaptureError.mockClear();
});

describe('reportHandledError', () => {
  it('drops cancellations (user dismiss / unmount) without reporting', () => {
    reportHandledError(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    reportHandledError(Object.assign(new Error('cancelled'), { name: 'CancelledError' }));
    expect(mockedCaptureError).not.toHaveBeenCalled();
  });

  it('drops expected auth-required GraphQL errors (a session-only query ran logged-out)', () => {
    // graphql-request ClientError shape: the backend returns HTTP 200 with the
    // guard message in response.errors[]. Must drop before the network check.
    const authError = Object.assign(new Error('Authentication required to perform this operation'), {
      response: {
        status: 200,
        errors: [{ message: 'Authentication required to perform this operation', path: ['myBoards'] }],
      },
    });
    reportHandledError(authError, { tags: { source: 'react-query' } });
    expect(mockedCaptureError).not.toHaveBeenCalled();
  });

  it('downgrades offline fetch failures to a warning and tags them network', () => {
    const offline = new TypeError('Network request failed');
    reportHandledError(offline, { tags: { source: 'react-query' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(offline, {
      level: 'warning',
      tags: { source: 'react-query', network: true },
    });
  });

  it('treats a transport ClientError (response without a numeric status) as network', () => {
    const transport = Object.assign(new Error('boom'), { response: { errors: [] } });
    reportHandledError(transport, { tags: { source: 'queue-mutation' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(transport, {
      level: 'warning',
      tags: { source: 'queue-mutation', network: true },
    });
  });

  it('forces warning for a network error even if the caller asked for a higher level', () => {
    const offline = new TypeError('Network request failed');
    reportHandledError(offline, { level: 'fatal', tags: { source: 'x' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(offline, {
      level: 'warning',
      tags: { source: 'x', network: true },
    });
  });

  it('reports a real server error (response with an HTTP status) at error level', () => {
    const serverError = Object.assign(new Error('Internal Server Error'), { response: { status: 500 } });
    reportHandledError(serverError, { tags: { source: 'react-query', kind: 'mutation' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(serverError, {
      level: 'error',
      tags: { source: 'react-query', kind: 'mutation' },
    });
  });

  it('defaults a plain error to error level', () => {
    const error = new Error('boom');
    reportHandledError(error, { tags: { source: 'ble-connect' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(error, {
      level: 'error',
      tags: { source: 'ble-connect' },
    });
  });

  it('lets the caller keep a non-error severity for a non-network failure', () => {
    const error = new Error('boom');
    reportHandledError(error, { level: 'info', tags: { source: 'x' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(error, { level: 'info', tags: { source: 'x' } });
  });
});

describe('reportError', () => {
  it('forwards verbatim to captureError', () => {
    const error = new Error('x');
    reportError(error, { level: 'error', tags: { source: 's' } });
    expect(mockedCaptureError).toHaveBeenCalledWith(error, { level: 'error', tags: { source: 's' } });
  });
});
