import { describe, it, expect } from 'vite-plus/test';
import { sanitizeSlugInput, gymSlugValidationError, looksLikeGymUuid, GYM_SLUG_MAX_LENGTH } from '../slug-utils';

describe('sanitizeSlugInput', () => {
  it('lowercases and strips illegal characters', () => {
    expect(sanitizeSlugInput('My Gym! 123')).toBe('mygym123');
  });

  it('keeps hyphens', () => {
    expect(sanitizeSlugInput('boulder-lab')).toBe('boulder-lab');
  });

  it('caps length at the backend maximum', () => {
    const long = 'a'.repeat(GYM_SLUG_MAX_LENGTH + 40);
    expect(sanitizeSlugInput(long)).toHaveLength(GYM_SLUG_MAX_LENGTH);
  });
});

describe('gymSlugValidationError', () => {
  it('flags an empty slug', () => {
    expect(gymSlugValidationError('')).toBe('empty');
    expect(gymSlugValidationError('   ')).toBe('empty');
  });

  it('flags a leading or trailing hyphen as invalid', () => {
    expect(gymSlugValidationError('-gym')).toBe('invalid');
    expect(gymSlugValidationError('gym-')).toBe('invalid');
  });

  it('flags uppercase or spaces as invalid', () => {
    expect(gymSlugValidationError('My Gym')).toBe('invalid');
  });

  it('accepts a well-formed slug', () => {
    expect(gymSlugValidationError('boulder-lab-2')).toBeNull();
    expect(gymSlugValidationError('kilter')).toBeNull();
  });
});

describe('looksLikeGymUuid', () => {
  it('matches a canonical UUID', () => {
    expect(looksLikeGymUuid('a7af2c7f-6abc-4c2c-9e4c-9f43a74d2ea9')).toBe(true);
  });

  it('rejects a word slug', () => {
    expect(looksLikeGymUuid('boulder-lab')).toBe(false);
  });
});
