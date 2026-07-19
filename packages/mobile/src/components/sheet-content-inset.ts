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
  const numeric = (candidate: unknown): number => (typeof candidate === 'number' ? candidate : 0);
  // Respect the consumer's existing bottom padding (paddingBottom wins over
  // paddingVertical over the padding shorthand) and add the inset to it.
  const existingBottom =
    flattened?.paddingBottom !== undefined
      ? numeric(flattened.paddingBottom)
      : flattened?.paddingVertical !== undefined
        ? numeric(flattened.paddingVertical)
        : numeric(flattened?.padding);
  return [contentContainerStyle, { paddingBottom: existingBottom + insetBottom }];
}
