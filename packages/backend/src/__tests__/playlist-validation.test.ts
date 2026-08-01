import { describe, expect, it } from 'vite-plus/test';
import { GetSmartPlaylistInputSchema, PlaylistColorSchema } from '../validation/schemas/playlists';

describe('playlist validation', () => {
  it('keeps the empty-string clear signal separate from concrete six-digit colours', () => {
    expect(PlaylistColorSchema.safeParse('#A1b2C3').success).toBe(true);
    expect(PlaylistColorSchema.safeParse('').success).toBe(true);
    expect(PlaylistColorSchema.safeParse(undefined).success).toBe(true);
    expect(PlaylistColorSchema.safeParse('#abc').success).toBe(false);
    expect(PlaylistColorSchema.safeParse('A1b2C3').success).toBe(false);
  });

  it('accepts smart-playlist angles through 90 degrees and rejects 91', () => {
    const baseInput = { type: 'PROJECTS' as const, userId: 'user-4016' };

    expect(GetSmartPlaylistInputSchema.safeParse({ ...baseInput, angle: 90 }).success).toBe(true);
    expect(GetSmartPlaylistInputSchema.safeParse({ ...baseInput, angle: 91 }).success).toBe(false);
  });
});
