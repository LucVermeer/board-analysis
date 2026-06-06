import type { UiVariantPreference } from '@boardsesh/key-value-storage';

/**
 * The resolved visual variant the whole app renders in. Unlike the stored
 * `UiVariantPreference` ('auto' | 'liquidGlass' | 'material'), this is the
 * concrete choice after `'auto'` has been resolved against device capability —
 * it is never `'auto'`.
 *
 *   liquidGlass — the iOS 26 Liquid Glass UI (preferred, primary)
 *   material    — the Material 3 UI (default off iOS 26)
 */
export type UiVariant = 'liquidGlass' | 'material';

/**
 * Resolve the effective variant from the user's preference and whether the
 * device can render Liquid Glass. An explicit choice always wins; `'auto'`
 * follows capability (glass on iOS 26, Material everywhere else).
 *
 * Pure and synchronous so the first paint can pick the right variant without
 * waiting on async storage — `glassCapable` is a synchronous native check.
 */
export function resolveUiVariant(preference: UiVariantPreference, glassCapable: boolean): UiVariant {
  if (preference === 'liquidGlass') return 'liquidGlass';
  if (preference === 'material') return 'material';
  return glassCapable ? 'liquidGlass' : 'material';
}
