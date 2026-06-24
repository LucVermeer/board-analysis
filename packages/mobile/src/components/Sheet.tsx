import { forwardRef, useCallback, useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
// Migrated off @gorhom/bottom-sheet to Expo's native bottom sheet (#3167).
// The native sheet draws its own scrim, drag handle and (on iOS 26) glass
// background, so the old SheetBackdrop / GlassSheetBackground / FullWindowOverlay
// wiring is gone. Scroll/keyboard coordination is handled natively.
import BottomSheet, { BottomSheetScrollView, type BottomSheetMethods } from '@expo/ui/community/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticMedium } from '../lib/haptics';
import { spacing } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';
import { androidSafeSnapPoints } from './sheet-snap-points';

type SheetProps = {
  children: ReactNode;
  snapPoints?: (string | number)[];
  enableDynamicSizing?: boolean;
  onChange?: (index: number) => void;
  onClose?: () => void;
  enablePanDownToClose?: boolean;
  // Render the content inside a scrollable container instead of a plain View.
  // Use this for content taller than the sheet.
  scrollable?: boolean;
  // Extra style for the content/scroll container.
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Optional bottom action area, pinned below the content. When an input lives
  // here (e.g. the comment composer) a KeyboardAvoidingView lifts it above the
  // keyboard on iOS; Android resizes the native sheet.
  footer?: ReactNode;
  // The native sheet owns keyboard avoidance, lifts above root chrome, and uses
  // the system (glass on iOS 26) background, so these legacy gorhom knobs are
  // accepted for source-compatibility but no longer do anything.
  keyboardBehavior?: 'extend' | 'fillParent' | 'interactive';
  keyboardBlurBehavior?: 'none' | 'restore';
  android_keyboardInputMode?: 'adjustPan' | 'adjustResize';
  fullWindowOverlay?: boolean;
  glass?: boolean;
};

export const Sheet = forwardRef<BottomSheetMethods, SheetProps>(function Sheet(
  {
    children,
    snapPoints: customSnapPoints,
    enableDynamicSizing = false,
    onChange,
    onClose,
    enablePanDownToClose = true,
    scrollable = false,
    contentContainerStyle,
    footer,
  },
  ref,
) {
  const { systemColors, sheet: sheetChrome } = useTheme();
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => customSnapPoints ?? ['50%', '90%'], [customSnapPoints]);

  const handleChange = useCallback(
    (index: number) => {
      if (index >= 0) hapticMedium();
      onChange?.(index);
    },
    [onChange],
  );

  const body = scrollable ? (
    <BottomSheetScrollView
      style={styles.content}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </BottomSheetScrollView>
  ) : (
    <View style={[styles.content, contentContainerStyle]}>{children}</View>
  );

  const footerBar = footer ? (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: systemColors.secondaryBackground,
          borderTopColor: systemColors.separator,
          paddingBottom: insets.bottom + spacing[3],
        },
      ]}
    >
      {footer}
    </View>
  ) : null;

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={enableDynamicSizing ? undefined : androidSafeSnapPoints(snapPoints)}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose={enablePanDownToClose}
      onChange={handleChange}
      onClose={onClose}
      handleIndicatorStyle={sheetChrome.handleStyle}
      style={styles.sheet}
    >
      {footer ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
          {footerBar}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheet: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  fill: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    // borderTopColor is applied inline from systemColors.separator (scheme-aware).
  },
});
