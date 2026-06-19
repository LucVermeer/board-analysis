import { describe, it, expect } from 'vitest';
import { matchClimbsToCaption, type CaptionMatchableClimb } from '../caption-climb-match';

function makeClimb(climbName: string, climbUuid = climbName.toLowerCase().replace(/\s+/g, '-')): CaptionMatchableClimb {
  return { climbName, climbUuid };
}

describe('matchClimbsToCaption', () => {
  it('matches a climb whose name appears in the caption', () => {
    const climbs = [makeClimb('Purple Nurple'), makeClimb('The Crimp Master')];
    const result = matchClimbsToCaption('Finally sent Purple Nurple today!', climbs);
    expect(result.map((climb) => climb.climbName)).toEqual(['Purple Nurple']);
  });

  it('ignores diacritics, emoji, and punctuation on both sides', () => {
    const climbs = [makeClimb('Café Crux')];
    const result = matchClimbsToCaption('cafe crux 🔥 @ 40°!!!', climbs);
    expect(result.map((climb) => climb.climbName)).toEqual(['Café Crux']);
  });

  it('matches whole names on word boundaries, not partial words', () => {
    const climbs = [makeClimb('Crimp'), makeClimb('Crimpy McCrimpface')];
    const result = matchClimbsToCaption('huge send on Crimpy McCrimpface', climbs);
    // "Crimp" must NOT match inside "Crimpy".
    expect(result.map((climb) => climb.climbName)).toEqual(['Crimpy McCrimpface']);
  });

  it('ranks the longer (more specific) match first', () => {
    const climbs = [makeClimb('Slab'), makeClimb('Slab Master')];
    const result = matchClimbsToCaption('Slab Master is the best', climbs);
    expect(result.map((climb) => climb.climbName)).toEqual(['Slab Master', 'Slab']);
  });

  it('skips very short climb names to avoid false positives', () => {
    const climbs = [makeClimb('Up')];
    expect(matchClimbsToCaption('send Up there', climbs)).toEqual([]);
  });

  it('de-dupes by climb when the same climb was logged more than once', () => {
    const climbs = [makeClimb('Purple Nurple', 'pn-1'), makeClimb('Purple Nurple', 'pn-1')];
    const result = matchClimbsToCaption('Purple Nurple again', climbs);
    expect(result).toHaveLength(1);
  });

  it('returns nothing for an empty or missing caption', () => {
    const climbs = [makeClimb('Purple Nurple')];
    expect(matchClimbsToCaption('', climbs)).toEqual([]);
    expect(matchClimbsToCaption(null, climbs)).toEqual([]);
    expect(matchClimbsToCaption(undefined, climbs)).toEqual([]);
  });

  it('preserves the caller row shape so extra fields survive matching', () => {
    const rows = [
      { climbUuid: 'pn', climbName: 'Purple Nurple', tickUuid: 'tick-1', frames: null },
      { climbUuid: 'cm', climbName: 'The Crimp Master', tickUuid: 'tick-2', frames: null },
    ];
    const result = matchClimbsToCaption('Sent Purple Nurple!', rows);
    expect(result).toEqual([{ climbUuid: 'pn', climbName: 'Purple Nurple', tickUuid: 'tick-1', frames: null }]);
  });
});
