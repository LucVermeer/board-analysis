import { describe, it, expect } from 'vitest';
import type { AscentFeedItem } from '@boardsesh/graphql/operations';
import { matchAscentsToCaption, partitionAscentsForShare } from '../match-ascents-to-caption';

function makeAscent(climbName: string, climbUuid = climbName.toLowerCase().replace(/\s+/g, '-')): AscentFeedItem {
  return {
    uuid: `tick-${climbUuid}`,
    climbUuid,
    climbName,
    setterUsername: null,
    boardType: 'kilter',
    layoutId: 1,
    angle: 40,
    isMirror: false,
    status: 'send',
    attemptCount: 1,
    quality: null,
    difficulty: null,
    difficultyName: null,
    consensusDifficulty: null,
    consensusDifficultyName: null,
    qualityAverage: null,
    isBenchmark: false,
    isNoMatch: false,
    comment: '',
    climbedAt: '2026-06-07T00:00:00.000Z',
    frames: null,
  };
}

describe('matchAscentsToCaption', () => {
  it('matches a climb whose name appears in the caption', () => {
    const ascents = [makeAscent('Purple Nurple'), makeAscent('The Crimp Master')];
    const result = matchAscentsToCaption('Finally sent Purple Nurple today!', ascents);
    expect(result.map((a) => a.climbName)).toEqual(['Purple Nurple']);
  });

  it('ignores diacritics, emoji, and punctuation on both sides', () => {
    const ascents = [makeAscent('Café Crux')];
    const result = matchAscentsToCaption('cafe crux 🔥 @ 40°!!!', ascents);
    expect(result.map((a) => a.climbName)).toEqual(['Café Crux']);
  });

  it('matches whole names on word boundaries, not partial words', () => {
    const ascents = [makeAscent('Crimp'), makeAscent('Crimpy McCrimpface')];
    const result = matchAscentsToCaption('huge send on Crimpy McCrimpface', ascents);
    // "Crimp" must NOT match inside "Crimpy".
    expect(result.map((a) => a.climbName)).toEqual(['Crimpy McCrimpface']);
  });

  it('ranks the longer (more specific) match first', () => {
    const ascents = [makeAscent('Slab'), makeAscent('Slab Master')];
    const result = matchAscentsToCaption('Slab Master is the best', ascents);
    expect(result.map((a) => a.climbName)).toEqual(['Slab Master', 'Slab']);
  });

  it('skips very short climb names to avoid false positives', () => {
    const ascents = [makeAscent('Up')];
    expect(matchAscentsToCaption('send Up there', ascents)).toEqual([]);
  });

  it('de-dupes by climb when the same climb was logged more than once', () => {
    const ascents = [makeAscent('Purple Nurple', 'pn-1'), makeAscent('Purple Nurple', 'pn-1')];
    const result = matchAscentsToCaption('Purple Nurple again', ascents);
    expect(result).toHaveLength(1);
  });

  it('returns nothing for an empty or missing caption', () => {
    const ascents = [makeAscent('Purple Nurple')];
    expect(matchAscentsToCaption('', ascents)).toEqual([]);
    expect(matchAscentsToCaption(null, ascents)).toEqual([]);
    expect(matchAscentsToCaption(undefined, ascents)).toEqual([]);
  });
});

describe('partitionAscentsForShare', () => {
  it('pulls a caption-matched climb into suggestions and out of the main list', () => {
    const ascents = [makeAscent('Purple Nurple', 'pn'), makeAscent('The Crimp Master', 'cm')];
    const { suggestions, listData } = partitionAscentsForShare('Sent Purple Nurple!', ascents, false);
    expect(suggestions.map((a) => a.climbUuid)).toEqual(['pn']);
    expect(listData.map((a) => a.climbUuid)).toEqual(['cm']);
  });

  it('shows no suggestions and the full list while searching', () => {
    const ascents = [makeAscent('Purple Nurple', 'pn'), makeAscent('The Crimp Master', 'cm')];
    const { suggestions, listData } = partitionAscentsForShare('Sent Purple Nurple!', ascents, true);
    expect(suggestions).toEqual([]);
    expect(listData).toBe(ascents);
  });

  it('returns the full list unchanged when nothing matches', () => {
    const ascents = [makeAscent('Purple Nurple', 'pn')];
    expect(partitionAscentsForShare('a generic caption', ascents, false)).toEqual({
      suggestions: [],
      listData: ascents,
    });
    expect(partitionAscentsForShare(null, ascents, false)).toEqual({ suggestions: [], listData: ascents });
  });
});
