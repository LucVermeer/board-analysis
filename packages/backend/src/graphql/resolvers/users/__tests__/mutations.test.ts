/**
 * Unit tests for userMutations.updateProfile — covers the cohort-property
 * fields added for issue #3399 (createdAt, favoriteCount) on both the
 * insert (no existing profile row) and update paths. The db client is
 * mocked, mirroring tester.test.ts / queries.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

const { limitMock, insertValuesMock, updateSetMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  insertValuesMock: vi.fn(async () => undefined),
  updateSetMock: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
}));

vi.mock('../../../../db/client', () => ({
  db: {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(limitMock()),
      };
      return chain;
    },
    insert: () => ({ values: insertValuesMock }),
    update: () => ({ set: updateSetMock }),
  },
}));

vi.mock('../tester', () => ({
  userIsTester: vi.fn(async () => false),
}));

import { userMutations } from '../mutations';
import { userIsTester } from '../tester';

const userIsTesterMock = vi.mocked(userIsTester);

function makeCtx(userId = 'user-1'): ConnectionContext {
  return { connectionId: `http-${userId}`, userId, isAuthenticated: true };
}

const REFRESHED_USER_ROW = {
  id: 'user-1',
  email: 'climber@example.com',
  name: 'Climber',
  image: null,
  createdAt: new Date('2024-02-02T00:00:00.000Z'),
  favoriteCount: 3,
};

describe('userMutations.updateProfile', () => {
  beforeEach(() => {
    limitMock.mockReset();
    insertValuesMock.mockClear();
    updateSetMock.mockClear();
    userIsTesterMock.mockReset();
    userIsTesterMock.mockResolvedValue(false);
  });

  it('updates an existing profile row and maps createdAt/favoriteCount from the refreshed select', async () => {
    limitMock
      .mockReturnValueOnce([{ userId: 'user-1', displayName: 'Old Name', avatarUrl: null }]) // existing profile check
      .mockReturnValueOnce([REFRESHED_USER_ROW]) // refreshed users select
      .mockReturnValueOnce([{ userId: 'user-1', displayName: 'New Name', avatarUrl: null }]); // refreshed profiles select

    const result = await userMutations.updateProfile(undefined, { input: { displayName: 'New Name' } }, makeCtx());

    expect(updateSetMock).toHaveBeenCalledOnce();
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(result.createdAt).toBe('2024-02-02T00:00:00.000Z');
    expect(result.favoriteCount).toBe(3);
    expect(result.displayName).toBe('New Name');
  });

  it('creates a new profile row when none exists yet, still returning createdAt/favoriteCount', async () => {
    limitMock
      .mockReturnValueOnce([]) // no existing profile row
      .mockReturnValueOnce([REFRESHED_USER_ROW])
      .mockReturnValueOnce([{ userId: 'user-1', displayName: 'First Name', avatarUrl: null }]);

    const result = await userMutations.updateProfile(undefined, { input: { displayName: 'First Name' } }, makeCtx());

    expect(insertValuesMock).toHaveBeenCalledOnce();
    expect(updateSetMock).not.toHaveBeenCalled();
    expect(result.createdAt).toBe('2024-02-02T00:00:00.000Z');
    expect(result.favoriteCount).toBe(3);
  });
});
