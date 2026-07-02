// Modal bottom sheet, presented imperatively via ref (`present()` / `dismiss()`)
// OR declaratively via the `visible` prop.
//
// Migrated off @gorhom/bottom-sheet to Expo's native bottom sheet (#3167): the
// native modal already presents above root chrome (the queue bar), so the old
// FullWindowOverlay container is gone, and the native sheet supplies the scrim,
// handle and (iOS 26) glass background — retiring SheetBackdrop / GlassSheetBackground.
//
// All present/dismiss go through the SheetPresentationProvider coordinator, which
// serializes native sheet transitions so two never overlap on the same presenter
// (the iOS UIKit deadlock / app freeze — see sheet-presentation-provider.tsx).

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, type BottomSheetMethods } from '@expo/ui/community/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticMedium } from '../lib/haptics';
import { spacing } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';
import { androidSafeSnapPoints } from './sheet-snap-points';
import { useSheetColumnStyle } from './use-sheet-column-style';
import { useManagedSheet, type PresenterGroup } from '../providers/sheet-presentation-provider';

type ModalSheetProps = {
  children: ReactNode;
  /** Controlled open state. Leave undefined for purely imperative consumers that
   * drive the sheet through the forwarded ref. */
  visible?: boolean;
  snapPoints?: (string | number)[];
  enableDynamicSizing?: boolean;
  onChange?: (index: number) => void;
  /** Fired when the user closes the sheet themselves (pan-down / backdrop), so a
   * controlled parent can clear the state driving `visible`. */
  onClose?: () => void;
  /** Fired AFTER the dismiss animation has really settled (the accurate hook). */
  onFullyDismissed?: () => void;
  /** Serialization domain. Sheets presented off the same view controller share a
   * group; defaults to the root window VC. */
  presenterGroup?: PresenterGroup;
  enablePanDownToClose?: boolean;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
};

export const ModalSheet = forwardRef<BottomSheetMethods, ModalSheetProps>(function ModalSheet(
  {
    children,
    visible,
    snapPoints: customSnapPoints,
    enableDynamicSizing = false,
    onChange,
    onClose,
    onFullyDismissed,
    presenterGroup,
    enablePanDownToClose = true,
    scrollable = false,
    contentContainerStyle,
    footer,
  },
  ref,
) {
  const { systemColors, sheet } = useTheme();
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => customSnapPoints ?? ['50%', '90%'], [customSnapPoints]);

  // Single-detent sheets jump to full screen on @expo/ui's Android sheet — give
  // them a partial state instead (see androidSafeSnapPoints).
  const effectiveSnapPoints = useMemo(() => androidSafeSnapPoints(snapPoints), [snapPoints]);

  const sheetRef = useRef<BottomSheetMethods>(null);
  const managed = useManagedSheet({
    open: visible,
    group: presenterGroup,
    sheetRef,
    onClose,
    onFullyDismissed,
  });
  useImperativeHandle(ref, () => managed.handle as BottomSheetMethods, [managed.handle]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track the resting detent so the iOS column bound follows drags between detents.
  const [activeIndex, setActiveIndex] = useState(0);
  const columnStyle = useSheetColumnStyle(snapPoints, { enableDynamicSizing, activeIndex });

  const handleChange = useCallback(
    (index: number) => {
      if (index >= 0) {
        hapticMedium();
        setActiveIndex(index);
      }
      managed.onChange(index);
      onChangeRef.current?.(index);
    },
    [managed],
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
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={enableDynamicSizing ? undefined : effectiveSnapPoints}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose={enablePanDownToClose}
      handleIndicatorStyle={sheet.handleStyle}
      onChange={handleChange}
      style={styles.sheet}
    >
      {footer ? (
        // The single flex child of the native sheet: bound to the detent height on
        // iOS (see useSheetColumnStyle) so the pinned footer can't fall off-screen
        // (#3330); flex:1 on Android / fitToContents.
        <KeyboardAvoidingView style={columnStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
          {footerBar}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </BottomSheetModal>
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
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
