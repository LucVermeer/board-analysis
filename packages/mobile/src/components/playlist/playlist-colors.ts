// Cycling fallback palette mirroring web's `PLAYLIST_COLORS`
// (playlist-preview-square.tsx). Used as the preview tint when a playlist has
// no valid `color`, and as the swatch options in the create/edit form.
export const PLAYLIST_COLORS = [
  '#8C4A52', // primary
  '#5fb27a', // accentGreen
  '#9C27B0', // purple
  '#C4943C', // warning
  '#EC4899', // pink
  '#6B9080', // success
  '#d65a4f', // accentRose
  '#FBBF24', // amber
] as const;

const HEX_PATTERN = /^#([0-9A-Fa-f]{3}){1,2}$/;

export function isValidHexColor(color: string): boolean {
  return HEX_PATTERN.test(color);
}
