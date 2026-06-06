import { describe, expect, it } from 'vitest';
import { normalizeSearchName } from '../search-name';

describe('normalizeSearchName', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeSearchName('  Moonage Daydream  ')).toBe('Moonage Daydream');
  });

  it('normalizes whitespace-only searches to empty', () => {
    expect(normalizeSearchName('   ')).toBe('');
  });
});
