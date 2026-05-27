import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGraphQLClient } from '../create-client';

let capturedOptions: Record<string, unknown> = {};

vi.mock('graphql-ws', () => ({
  createClient: (opts: Record<string, unknown>) => {
    capturedOptions = opts;
    return {
      on: () => () => {},
      subscribe: () => () => {},
      iterate: () => {
        throw new Error('not used');
      },
      dispose: vi.fn(async () => {}),
      terminate: () => {},
    };
  },
}));

describe('createGraphQLClient', () => {
  afterEach(() => {
    capturedOptions = {};
  });

  it('passes static authToken as connectionParams object', () => {
    createGraphQLClient({ url: 'ws://localhost/graphql', authToken: 'tok123' });
    expect(capturedOptions.connectionParams).toEqual({ authToken: 'tok123' });
  });

  it('passes async connectionParams provider through', () => {
    const provider = vi.fn(async () => ({ authToken: 'dynamic' }));
    createGraphQLClient({ url: 'ws://localhost/graphql', connectionParams: provider });
    expect(capturedOptions.connectionParams).toBe(provider);
  });

  it('passes custom shouldRetry predicate', () => {
    const predicate = vi.fn(() => false);
    createGraphQLClient({ url: 'ws://localhost/graphql', shouldRetry: predicate });
    expect(capturedOptions.shouldRetry).toBe(predicate);
  });

  it('defaults shouldRetry to always-true', () => {
    createGraphQLClient({ url: 'ws://localhost/graphql' });
    expect((capturedOptions.shouldRetry as () => boolean)()).toBe(true);
  });

  it('omits connectionParams when neither authToken nor provider given', () => {
    createGraphQLClient({ url: 'ws://localhost/graphql' });
    expect(capturedOptions.connectionParams).toBeUndefined();
  });
});
