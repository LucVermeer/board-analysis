import { forwardRef, useCallback, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { hapticMedium } from '../lib/haptics';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';

type SheetProps = {
  children: ReactNode;
  snapPoints?: (string | number)[];
  enableDynamicSizing?: boolean;
  onChange?: (index: number) => void;
  onClose?: () => void;
  enablePanDownToClose?: boolean;
  // Render the content inside a BottomSheetScrollView instead of a plain
  // BottomSheetView. Use this for content taller than the sheet — never wrap
  // your own BottomSheetScrollView in the children, as nesting it inside the
  // default BottomSheetView breaks gorhom's scroll gesture wiring.
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export const Sheet = forwardRef<BottomSheet, SheetProps>(function Sheet(
  {
    children,
    snapPoints: customSnapPoints,
    enableDynamicSizing = false,
    onChange,
    onClose,
    enablePanDownToClose = true,
    scrollable = false,
    contentContainerStyle,
  },
  ref,
) {
  const { systemColors } = useTheme();
  const snapPoints = useMemo(() => customSnapPoints ?? ['50%', '90%'], [customSnapPoints]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const handleChange = useCallback(
    (index: number) => {
      if (index >= 0) hapticMedium();
      onChange?.(index);
    },
    [onChange],
  );

  const backgroundStyle = {
    ...styles.background,
    backgroundColor: systemColors.secondaryBackground,
  };

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={enableDynamicSizing ? undefined : snapPoints}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose={enablePanDownToClose}
      backdropComponent={renderBackdrop}
      onChange={handleChange}
      onClose={onClose}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={backgroundStyle}
      style={styles.sheet}
    >
      {scrollable ? (
        <BottomSheetScrollView style={styles.content} contentContainerStyle={contentContainerStyle} showsVerticalScrollIndicator={false}>
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={styles.content}>{children}</BottomSheetView>
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
  background: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  indicator: {
    backgroundColor: iosSystemColors.separator,
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
});
