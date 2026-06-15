import { describe, it, expect } from 'vitest';
import { nounFromCountLabel } from '../noun-from-count-label';

describe('nounFromCountLabel', () => {
  it('strips the leading count from en-US singular/plural labels', () => {
    expect(nounFromCountLabel('1 send')).toBe('send');
    expect(nounFromCountLabel('3 sends')).toBe('sends');
    expect(nounFromCountLabel('1 flash')).toBe('flash');
    expect(nounFromCountLabel('2 flashes')).toBe('flashes');
    expect(nounFromCountLabel('1 try')).toBe('try');
    expect(nounFromCountLabel('2 tries')).toBe('tries');
  });

  it('strips the leading count from es labels', () => {
    expect(nounFromCountLabel('1 encadene')).toBe('encadene');
    expect(nounFromCountLabel('3 encadenes')).toBe('encadenes');
    expect(nounFromCountLabel('1 intento')).toBe('intento');
    expect(nounFromCountLabel('2 intentos')).toBe('intentos');
  });

  it('strips the leading count from fr labels', () => {
    expect(nounFromCountLabel('1 réussite')).toBe('réussite');
    expect(nounFromCountLabel('3 réussites')).toBe('réussites');
    expect(nounFromCountLabel('1 essai')).toBe('essai');
    expect(nounFromCountLabel('2 essais')).toBe('essais');
  });

  it('returns the label unchanged when there is no leading number', () => {
    // No count to strip — a count-last or no-space locale must not drop the noun.
    expect(nounFromCountLabel('réussites')).toBe('réussites');
    expect(nounFromCountLabel('送 3')).toBe('送 3');
  });
});
