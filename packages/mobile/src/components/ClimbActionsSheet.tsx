import { forwardRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Share } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { Sheet } from './Sheet';
import { ListRow } from './ListRow';
import { Icon } from './Icon';
import { brandColors } from '../theme/colors';
import { iosSystemColors } from '../theme/ios-colors';

type ClimbActionsSheetProps = {
  climb: Climb | null;
  onAddToQueue?: () => void;
  onToggleFavorite?: () => void;
  onDismiss?: () => void;
};

const ClimbActionsSheet = forwardRef<BottomSheet, ClimbActionsSheetProps>(function ClimbActionsSheet(
  { climb, onAddToQueue, onToggleFavorite, onDismiss },
  ref,
) {
  const { t } = useTranslation('climbs');

  const handleAddToQueue = useCallback(() => {
    onAddToQueue?.();
    onDismiss?.();
  }, [onAddToQueue, onDismiss]);

  const handleToggleFavorite = useCallback(() => {
    onToggleFavorite?.();
    onDismiss?.();
  }, [onToggleFavorite, onDismiss]);

  const handleShare = useCallback(async () => {
    if (!climb) return;
    try {
      await Share.share({ message: climb.name });
    } finally {
      onDismiss?.();
    }
  }, [climb, onDismiss]);

  const handleClose = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  const snapPoints = useMemo(() => ['35%'], []);

  return (
    <Sheet ref={ref} snapPoints={snapPoints} onClose={handleClose} enablePanDownToClose>
      <View style={styles.content}>
        {onAddToQueue && (
          <ListRow
            title={t('mobile.climbRow.addToQueue')}
            leading={<Icon name="add" size={22} color={brandColors.success} />}
            onPress={handleAddToQueue}
            showSeparator
          />
        )}
        {onToggleFavorite && (
          <ListRow
            title={t('mobile.climbRow.toggleFavorite')}
            leading={<Icon name="favorite" size={22} color={iosSystemColors.systemRed} />}
            onPress={handleToggleFavorite}
            showSeparator
          />
        )}
        <ListRow
          title={t('mobile.climbRow.share')}
          leading={<Icon name="share" size={22} color={brandColors.primary} />}
          onPress={handleShare}
          showSeparator={false}
        />
      </View>
    </Sheet>
  );
});

export { ClimbActionsSheet };

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
});
