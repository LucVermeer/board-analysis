import { afterEach, describe, expect, it, vi } from 'vitest';

// query-provider now wires React Query to RN connectivity/lifecycle, so it
// imports `react-native` (AppState/Platform). The real entry is Flow source
// Rolldown can't parse — stub the two members it touches. NetInfo is aliased to
// a stub in vite.config.ts.
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' },
}));

import { reportMutationFailure, reportQueryFailure } from '../query-provider';
import { reportHandledError } from '../../lib/error-reporting';

// The global caches are the whole point — a query/mutation failure anywhere in
// the app must reach error tracking once retries are exhausted. The cache
// onError handlers delegate to these reporters, so testing them covers the
// key serialization + tags without running the fetch/retry loop.
vi.mock('../../lib/error-reporting', () => ({
  reportHandledError: vi.fn(),
}));

const mockedReport = vi.mocked(reportHandledError);

afterEach(() => {
  mockedReport.mockClear();
});

describe('reportQueryFailure', () => {
  it('reports with the serialized queryKey and hash', () => {
    const error = new Error('query boom');
    reportQueryFailure(error, ['searchClimbs', { q: 'x' }], 'hash-1');
    expect(mockedReport).toHaveBeenCalledWith(error, {
      tags: { source: 'react-query', kind: 'query' },
      extra: { queryKey: JSON.stringify(['searchClimbs', { q: 'x' }]), queryHash: 'hash-1' },
    });
  });
});

describe('reportMutationFailure', () => {
  it('reports with the serialized mutationKey', () => {
    const error = new Error('mutation boom');
    reportMutationFailure(error, ['createPlaylist']);
    expect(mockedReport).toHaveBeenCalledWith(error, {
      tags: { source: 'react-query', kind: 'mutation' },
      extra: { mutationKey: JSON.stringify(['createPlaylist']) },
    });
  });

  it('reports a keyless mutation with a null mutationKey', () => {
    const error = new Error('keyless');
    reportMutationFailure(error, undefined);
    expect(mockedReport).toHaveBeenCalledWith(error, {
      tags: { source: 'react-query', kind: 'mutation' },
      extra: { mutationKey: null },
    });
  });
});
