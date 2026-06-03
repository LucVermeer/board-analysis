import { describe, expect, it } from 'vitest';
import type { Grade } from '@boardsesh/shared-schema';
import { defaultGradeCenter, gradeRailCenter, selectModalSendGrade } from '../grade-seed';

function grade(difficultyId: number): Grade {
  return { difficultyId, name: `V${difficultyId}` } as Grade;
}

const GRADES: Grade[] = Array.from({ length: 11 }, (_, index) => grade(10 + index)); // ids 10..20

describe('selectModalSendGrade', () => {
  it('returns undefined for no sends', () => {
    expect(selectModalSendGrade([])).toBeUndefined();
  });

  it('returns the most-frequent difficulty id', () => {
    expect(selectModalSendGrade([22, 22, 22, 20, 23])).toBe(22);
  });

  it('breaks ties toward the harder grade', () => {
    expect(selectModalSendGrade([20, 20, 22, 22])).toBe(22);
  });
});

describe('defaultGradeCenter', () => {
  it('returns undefined for an empty band', () => {
    expect(defaultGradeCenter([])).toBeUndefined();
  });

  it('lands in the upper-middle of the band', () => {
    // 11 grades (ids 10..20), index round(10*0.6)=6 -> id 16.
    expect(defaultGradeCenter(GRADES)).toBe(16);
  });
});

describe('gradeRailCenter', () => {
  it('prefers the current min selection', () => {
    expect(gradeRailCenter({ minGradeId: 18, maxGradeId: 20 }, GRADES, [12])).toBe(18);
  });

  it('falls back to max when only max is set', () => {
    expect(gradeRailCenter({ minGradeId: undefined, maxGradeId: 19 }, GRADES, [12])).toBe(19);
  });

  it('uses the modal send grade when nothing is selected', () => {
    expect(gradeRailCenter({ minGradeId: undefined, maxGradeId: undefined }, GRADES, [14, 14, 17])).toBe(14);
  });

  it('falls back to the default band center with no selection and no sends', () => {
    expect(gradeRailCenter({ minGradeId: undefined, maxGradeId: undefined }, GRADES, [])).toBe(16);
  });
});
