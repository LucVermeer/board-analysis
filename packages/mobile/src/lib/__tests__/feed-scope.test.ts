import { describe, it, expect } from 'vitest';
import { deriveFeedScopeInput } from '../feed/feed-scope';

describe('deriveFeedScopeInput', () => {
  it('crew mode is followingOnly across all boards', () => {
    expect(deriveFeedScopeInput('crew', 'board-1')).toEqual({ followingOnly: true, includeDailyHighlights: true });
    expect(deriveFeedScopeInput('crew', null)).toEqual({ followingOnly: true, includeDailyHighlights: true });
  });

  it('gym mode with a board scopes by boardUuid, not followingOnly', () => {
    expect(deriveFeedScopeInput('gym', 'board-7')).toEqual({
      boardUuid: 'board-7',
      followingOnly: false,
      includeDailyHighlights: true,
    });
  });

  it('gym mode with a null board is the global "Everyone" feed', () => {
    expect(deriveFeedScopeInput('gym', null)).toEqual({
      boardUuid: null,
      followingOnly: false,
      includeDailyHighlights: true,
    });
  });
});
