import { describe, expect, it } from 'vite-plus/test';
import { getClimbStars } from '@boardsesh/db/queries';

describe('getClimbStars', () => {
  it('keeps Aurora board quality on the 0-15 queue scale', () => {
    expect(getClimbStars('kilter', 3)).toBe(15);
    expect(getClimbStars('tension', '2.4')).toBe(12);
  });

  it('scales MoonBoard native 0-5 ratings onto the 0-15 queue scale', () => {
    expect(getClimbStars('moonboard', 5)).toBe(15);
    expect(getClimbStars('moonboard', '4.2')).toBe(13);
  });

  it('caps unexpected ratings at the queue schema maximum', () => {
    expect(getClimbStars('moonboard', 8)).toBe(15);
    expect(getClimbStars('kilter', 5)).toBe(15);
  });

  it('defaults missing ratings to zero stars', () => {
    expect(getClimbStars('moonboard', null)).toBe(0);
    expect(getClimbStars('kilter', 'not-a-number')).toBe(0);
  });
});
