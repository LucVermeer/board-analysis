import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../Text';
import { SheetGlassBackground } from '../SheetGlassBackground';
import { getHttpClient } from '../../lib/graphql/client';
import { GET_ANGLES, type GetAnglesQueryResponse } from '../../lib/graphql/operations';
import { hapticSelection } from '../../lib/haptics';
import { iosSystemColors } from '../../theme/ios-colors';
import { brandColors } from '../../theme/colors';
import { spacing, sheetStyles } from '../../theme/tokens';

type AngleSelectorSheetProps = {
  visible: boolean;
  onClose: () => void;
  boardName: string;
  layoutId: number;
  currentAngle: number;
  onAngleChange: (angle: number) => void;
};

type AngleItem = { angle: number };

export const AngleSelectorSheet = memo(function AngleSelectorSheet({
  visible,
  onClose,
  boardName,
  layoutId,
  currentAngle,
  onAngleChange,
}: AngleSelectorSheetProps) {
  const { t } = useTranslation('session');
  const sheetRef = useRef<BottomSheet>(null);
  const flatListRef = useRef<BottomSheetFlatListMethods | null>(null);

  const snapPoints = useMemo(() => ['50%'], []);

  const { data: anglesData } = useQuery({
    queryKey: ['angles', boardName, layoutId],
    queryFn: async () => {
      const client = getHttpClient();
      const response = await client.request<GetAnglesQueryResponse>(GET_ANGLES, {
        boardName,
        layoutId,
      });
      return response.angles;
    },
  });

  const angles = useMemo(() => anglesData ?? [], [anglesData]);

  // Refs to access latest values without adding deps that re-fire the effect
  const isOpenRef = useRef(false);
  const anglesRef = useRef(angles);
  anglesRef.current = angles;
  const currentAngleRef = useRef(currentAngle);
  currentAngleRef.current = currentAngle;

  useEffect(() => {
    if (visible) {
      if (isOpenRef.current) {
        // Already open — skip re-triggering
        return undefined;
      }
      isOpenRef.current = true;
      sheetRef.current?.snapToIndex(0);

      // Auto-scroll to current angle after a short delay to let the list render
      const currentIndex = anglesRef.current.findIndex((angleItem) => angleItem.angle === currentAngleRef.current);
      if (currentIndex >= 0) {
        const scrollTimer = setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex?.({
              index: currentIndex,
              animated: true,
              viewPosition: 0.5,
            });
          } catch {
            // scrollToIndex can throw if layout hasn't been computed yet
          }
        }, 300);
        return () => clearTimeout(scrollTimer);
      }
    } else {
      isOpenRef.current = false;
      sheetRef.current?.close();
    }
    return undefined;
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleAnglePress = useCallback(
    (angle: number) => {
      hapticSelection();
      onAngleChange(angle);
      onClose();
    },
    [onAngleChange, onClose],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const renderBackground = useCallback((props: BottomSheetBackgroundProps) => <SheetGlassBackground {...props} />, []);

  const renderAngleRow = useCallback(
    ({ item }: { item: AngleItem }) => {
      const isSelected = item.angle === currentAngle;

      return (
        <Pressable
          onPress={() => handleAnglePress(item.angle)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          style={({ pressed }) => [
            styles.angleRow,
            isSelected && styles.angleRowSelected,
            pressed && styles.angleRowPressed,
          ]}
        >
          <Text variant="body" style={[styles.angleText, isSelected && styles.angleTextSelected]}>
            {item.angle}°
          </Text>
          {isSelected && <View style={styles.selectedIndicator} />}
        </Pressable>
      );
    },
    [currentAngle, handleAnglePress],
  );

  const keyExtractor = useCallback((item: AngleItem) => String(item.angle), []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={handleClose}
      handleIndicatorStyle={sheetStyles.indicator}
      backgroundComponent={renderBackground}
    >
      <View style={styles.header}>
        <Text variant="headline">{t('mobile.angleSelector.title')}</Text>
      </View>
      <BottomSheetFlatList
        ref={flatListRef}
        data={angles}
        keyExtractor={keyExtractor}
        renderItem={renderAngleRow}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_data, index) => ({
          length: ANGLE_ROW_HEIGHT,
          offset: ANGLE_ROW_HEIGHT * index,
          index,
        })}
      />
    </BottomSheet>
  );
});

const ANGLE_ROW_HEIGHT = 52;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
  },
  listContent: {
    paddingBottom: spacing[8],
  },
  angleRow: {
    height: ANGLE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
  },
  angleRowSelected: {
    backgroundColor: `${brandColors.primary}14`,
  },
  angleRowPressed: {
    opacity: 0.6,
  },
  angleText: {
    color: iosSystemColors.systemGray,
  },
  angleTextSelected: {
    fontWeight: '600',
    color: brandColors.primary,
  },
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brandColors.primary,
  },
});
