// Pure hex/colour maths — no `react-native` import, so it stays importable from
// node-env unit tests (and from anywhere that just needs the maths, not the
// PlatformColor system map). `theme/colors.ts` re-exports these so existing call
// sites keep importing them from `../theme/colors`.

/**
 * Normalise a `#RGB`/`#RRGGBB` hex string to a 6-digit hex (no `#`), or return
 * `null` for any other format (already-`rgba()`, named colour, PlatformColor).
 * Shared by `withAlpha` and `parseHex` so the expansion/validation rule can't
 * drift between them.
 */
export function expandHex(color: string): string | null {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
  return full.length === 6 && !/[^0-9a-fA-F]/.test(full) ? full : null;
}

/**
 * Apply an alpha (0–1) to a colour. Handles `#RGB` and `#RRGGBB` hex by
 * emitting an `rgba()` string; any other format (already-`rgba()`, named
 * colour, PlatformColor) is returned unchanged so this never produces an
 * invalid colour value. Safer than concatenating a hex alpha suffix, which
 * only works for 6-digit hex.
 */
export function withAlpha(color: string, alpha: number): string {
  const full = expandHex(color);
  if (!full) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[withAlpha] expected a hex colour, got "${color}" — returning it unchanged (alpha not applied)`);
    }
    return color;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseHex(color: string): [number, number, number] | null {
  const full = expandHex(color);
  if (!full) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function toHexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

/**
 * Alpha-composite `foreground` over `background` at `alpha` (0–1) and return an
 * opaque `#RRGGBB`. Unlike `withAlpha` (which yields a translucent `rgba()`),
 * this is for surfaces that float over arbitrary content and must stay opaque —
 * e.g. a variant-tinted toast pill that washes its brand hue over a neutral
 * surface yet can't let the content behind bleed through. Both inputs must be
 * `#RGB`/`#RRGGBB` hex; any other format returns `background` unchanged so this
 * never emits an invalid colour.
 */
export function blendOpaque(foreground: string, background: string, alpha: number): string {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[blendOpaque] expected hex colours, got foreground "${foreground}" / background "${background}" — returning background unchanged`,
      );
    }
    return background;
  }
  const mix = (channel: 0 | 1 | 2) => fg[channel] * alpha + bg[channel] * (1 - alpha);
  return `#${toHexByte(mix(0))}${toHexByte(mix(1))}${toHexByte(mix(2))}`;
}
