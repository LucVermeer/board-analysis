// Cycling swatch palette for playlists. Used as the preview tint when a playlist
// has no valid `color`, and as the swatch options in the create/edit form. Leads
// with the violet brand + amber accent, then a varied set so playlists stay
// distinguishable. Mobile-specific (intentionally diverges from web's list, which
// keeps the old maroon-led order).
export const PLAYLIST_COLORS = [
  '#6D28D9', // brand violet
  '#FF8A3D', // amber accent
  '#047857', // emerald
  '#2563EB', // blue
  '#DB2777', // pink
  '#0891B2', // cyan
  '#CA8A04', // gold
  '#DC2626', // red
] as const;

const HEX_PATTERN = /^#([0-9A-Fa-f]{3}){1,2}$/;

export function isValidHexColor(color: string): boolean {
  return HEX_PATTERN.test(color);
}
