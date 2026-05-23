import { describe, it, expect } from 'vitest';
import { getInitials } from '../../lib/get-initials';

describe('getInitials', () => {
  it('extracts initials from a two-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('extracts a single initial from a one-word name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('takes only the first two words for multi-word names', () => {
    expect(getInitials('John Paul Smith')).toBe('JP');
  });

  it('returns empty string for empty input', () => {
    expect(getInitials('')).toBe('');
  });

  it('uppercases lowercase names', () => {
    expect(getInitials('lowercase name')).toBe('LN');
  });

  it('handles names with extra whitespace between words', () => {
    // split(' ') produces empty strings between multiple spaces
    // so "a  b" splits to ["a", "", "b"], slice(0,2) = ["a", ""], charAt(0) = ""
    const result = getInitials('a  b');
    expect(result).toBe('A');
  });

  it('handles a single character name', () => {
    expect(getInitials('X')).toBe('X');
  });

  it('handles already-uppercase names', () => {
    expect(getInitials('MARCO DEJONGH')).toBe('MD');
  });
});
