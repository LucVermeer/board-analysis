import { useMemo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Compose a sheet body's `contentContainerStyle` so it clears the bottom
 * safe-area inset ON TOP of whatever bottom padding the consumer already asked
 * for, rather than replacing it.
 *
 * The native `@expo/ui` sheet does NOT clear the bottom safe area on EITHER
 * platform — neither the Android edge-to-edge navigation bar (~48dp 3-button bar /
 * gesture pill) nor the iOS home indicator (~34pt) — so a control at the bottom of
 * a footerless sheet sits under it unless the content adds `insets.bottom` itself.
 * Applying it on both platforms is correct and does NOT double-inset: `insets.bottom`
 * is 0 when there's nothing to clear, and this matches the app's established sheet
 * convention — the shared `Sheet`/`ModalSheet` footers and bespoke sheets like
 * `EndSessionSheet` / `InviteSheet` already add `insets.bottom` unconditionally
 * (see the "~34pt on gesture-nav phones" note in `EndSessionSheet`). A
 * `Platform.OS === 'android'` guard would reintroduce the home-indicator overlap on
 * iOS gesture-nav phones.
 *
 * Numeric-only contract: only numeric bottom padding composes arithmetically. If
 * the consumer's effective bottom padding is non-numeric (e.g. a `'5%'` string),
 * the style is returned untouched — that explicit choice is respected rather than
 * silently overwritten with the bare inset.
 *
 * Used by the footerless branch of the shared `Sheet` / `ModalSheet` wrappers. With
 * a pinned footer the body scrolls above a footer that already carries the inset, so
 * this is not applied there.
 */
export function withSheetBottomInset(
  contentContainerStyle: StyleProp<ViewStyle>,
  insetBottom: number,
): StyleProp<ViewStyle> {
  if (insetBottom <= 0) return contentContainerStyle;
  const flattened = StyleSheet.flatten(contentContainerStyle) as ViewStyle | undefined;
  // The consumer's effective bottom padding: paddingBottom wins over
  // paddingVertical over the padding shorthand.
  const existingBottom = flattened?.paddingBottom ?? flattened?.paddingVertical ?? flattened?.padding;
  // Only numbers add arithmetically; leave a non-numeric value (e.g. '5%') as the
  // consumer set it rather than replacing it with the bare inset.
  if (existingBottom !== undefined && typeof existingBottom !== 'number') {
    return contentContainerStyle;
  }
  return [contentContainerStyle, { paddingBottom: (existingBottom ?? 0) + insetBottom }];
}

/**
 * Footerless body `contentContainerStyle` for the shared `Sheet` / `ModalSheet`
 * wrappers: with a pinned footer the body scrolls above a footer that already
 * carries the inset, so nothing is added; without one the body sits against the
 * bottom edge and must clear the safe area itself (via `withSheetBottomInset`).
 *
 * Keyed on `hasFooter` (a boolean), not the footer node, so an inline footer's
 * per-render identity can't defeat the memo.
 */
export function useSheetBodyContentStyle(
  hasFooter: boolean,
  contentContainerStyle: StyleProp<ViewStyle>,
  insetBottom: number,
): StyleProp<ViewStyle> {
  return useMemo(
    () => (hasFooter ? contentContainerStyle : withSheetBottomInset(contentContainerStyle, insetBottom)),
    [hasFooter, contentContainerStyle, insetBottom],
  );
}
