// Pure WCAG relative-luminance/contrast math, extracted into
// `@boardsesh/board-constants` so the web gym-kiosk dashboard (and anything
// else needing brand-contrast text) can share it without duplicating. This
// file re-exports so existing mobile imports keep working unchanged.
export {
  readableDarkText,
  readableLightText,
  relativeLuminance,
  contrastRatio,
  readableTextColor,
} from '@boardsesh/board-constants/readable-text-color';
