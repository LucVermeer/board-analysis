import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Compose a sheet body's `contentContainerStyle` so it clears the bottom
 * safe-area inset — the Android edge-to-edge navigation bar (a ~48dp 3-button bar
 * or the gesture pill) — ON TOP of whatever bottom padding the consumer already
 * asked for, rather than replacing it.
 *
 * Used by the footerless branch of the shared `Sheet` / `ModalSheet` wrappers: the
 * native `@expo/ui` sheet does not pad its content for the system nav bar, so a
 * control at the bottom of a footerless sheet would otherwise sit under it. With a
 * pinned footer the body scrolls above a footer that already carries the inset, so
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
