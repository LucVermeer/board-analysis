import { describe, it, expect } from 'vitest';
import {
  mergeUniquePlaylistClimbs,
  playlistSuggestionSourceMatches,
  pruneSuggestedQueueItemsAfterCurrent,
} from '../playlist-suggestions';
import type { Climb, ClimbQueueItem, PlaylistSuggestionSource } from '../types';

function makeClimb(uuid: string, name?: string): Climb {
  return { uuid, name: name ?? `Climb ${uuid}` } as Climb;
}

function makeQueueItem(uuid: string, options: { suggested?: boolean; climbUuid?: string } = {}): ClimbQueueItem {
  return {
    uuid,
    climb: { uuid: options.climbUuid ?? `climb-${uuid}`, name: 'Test', mirrored: false } as Climb,
    addedBy: null,
    suggested: options.suggested ?? false,
  } as ClimbQueueItem;
}

describe('mergeUniquePlaylistClimbs', () => {
  it('deduplicates climbs by uuid', () => {
    const activated = makeClimb('a');
    const climbs = [makeClimb('a'), makeClimb('b'), makeClimb('b'), makeClimb('c')];

    const result = mergeUniquePlaylistClimbs(activated, climbs);
    const uuids = result.map((climb) => climb.uuid);
    expect(uuids).toEqual(['a', 'b', 'c']);
  });

  it('always includes the activated climb even if not in climbs list', () => {
    const activated = makeClimb('activated');
    const climbs = [makeClimb('x'), makeClimb('y')];

    const result = mergeUniquePlaylistClimbs(activated, climbs);
    expect(result.map((climb) => climb.uuid)).toContain('activated');
  });

  it('does not duplicate activated climb if already present', () => {
    const activated = makeClimb('a');
    const climbs = [makeClimb('a'), makeClimb('b')];

    const result = mergeUniquePlaylistClimbs(activated, climbs);
    expect(result).toHaveLength(2);
  });
});

describe('playlistSuggestionSourceMatches', () => {
  const source: PlaylistSuggestionSource = {
    playlistUuid: 'playlist-1',
    activatedClimbUuid: 'climb-1',
    boardKey: 'kilter-1-1',
    climbs: [],
  };

  it('returns true when all fields match', () => {
    expect(playlistSuggestionSourceMatches(source, { ...source })).toBe(true);
  });

  it('returns false when playlistUuid differs', () => {
    expect(playlistSuggestionSourceMatches(source, { ...source, playlistUuid: 'different' })).toBe(false);
  });

  it('returns false when activatedClimbUuid differs', () => {
    expect(playlistSuggestionSourceMatches(source, { ...source, activatedClimbUuid: 'different' })).toBe(false);
  });

  it('returns false when boardKey differs', () => {
    expect(playlistSuggestionSourceMatches(source, { ...source, boardKey: 'different' })).toBe(false);
  });

  it('returns false when current is null', () => {
    expect(playlistSuggestionSourceMatches(null, source)).toBe(false);
  });
});

describe('pruneSuggestedQueueItemsAfterCurrent', () => {
  it('removes suggested items after current but preserves non-suggested', () => {
    const current = makeQueueItem('current');
    const suggestedAfter = makeQueueItem('suggested-after', { suggested: true });
    const manualAfter = makeQueueItem('manual-after', { suggested: false });
    const queue = [current, suggestedAfter, manualAfter];

    const result = pruneSuggestedQueueItemsAfterCurrent(queue, current);
    expect(result.map((item) => item.uuid)).toEqual(['current', 'manual-after']);
  });

  it('preserves suggested items before current', () => {
    const suggestedBefore = makeQueueItem('suggested-before', { suggested: true });
    const current = makeQueueItem('current');
    const suggestedAfter = makeQueueItem('suggested-after', { suggested: true });
    const queue = [suggestedBefore, current, suggestedAfter];

    const result = pruneSuggestedQueueItemsAfterCurrent(queue, current);
    expect(result.map((item) => item.uuid)).toEqual(['suggested-before', 'current']);
  });

  it('returns unchanged queue when current item is not found', () => {
    const itemA = makeQueueItem('a');
    const notInQueue = makeQueueItem('not-in-queue');
    const queue = [itemA];

    const result = pruneSuggestedQueueItemsAfterCurrent(queue, notInQueue);
    expect(result).toBe(queue);
  });
});
