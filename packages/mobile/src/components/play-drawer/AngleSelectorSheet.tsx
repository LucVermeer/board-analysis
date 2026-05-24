import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../Text';
import { getHttpClient } from '../../lib/graphql/client';
import { GET_ANGLES, type GetAnglesQueryResponse } from '../../lib/graphql/operations';
import { hapticSelection } from '../../lib/haptics';
import { iosSystemColors } from '../../theme/ios-colors';
import { brandColors } from '../../theme/colors';
import { spacing } from '../../theme/tokens';

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
  const flatListRef = useRef<{
    scrollToIndex?: (params: { index: number; animated: boolean; viewPosition: number }) => void;
  }>(null);

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

  useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);

      // Auto-scroll to current angle after a short delay to let the list render
      const currentIndex = angles.findIndex((angleItem) => angleItem.angle === currentAngle);
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
      sheetRef.current?.close();
    }
    return undefined;
  }, [visible, angles, currentAngle]);

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
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={styles.background}
    >
      <View style={styles.header}>
        <Text variant="headline">{t('mobile.angleSelector.title')}</Text>
      </View>
      <BottomSheetFlatList
        ref={flatListRef as unknown as React.RefObject<never>}
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
  indicator: {
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  background: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
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
