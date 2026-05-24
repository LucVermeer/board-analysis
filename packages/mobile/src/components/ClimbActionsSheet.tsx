import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Share } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import type { Climb } from '@boardsesh/shared-schema';
import { Sheet } from './Sheet';
import { ListRow } from './ListRow';
import { Icon } from './Icon';
import { useToast } from '../providers/toast-provider';
import { brandColors } from '../theme/colors';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing } from '../theme/tokens';
import { WEB_BASE_URL } from '../lib/env';

type ClimbActionsSheetProps = {
  visible: boolean;
  climb: Climb | null;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  onAddToQueue?: () => void;
  onToggleFavorite?: () => void;
  onClose: () => void;
};

function buildClimbUrl(
  boardName: string,
  layoutId: number,
  sizeId: number,
  setIds: string,
  angle: number,
  climbUuid: string,
): string {
  return `${WEB_BASE_URL}/${boardName}/${layoutId}/${sizeId}/${setIds}/${angle}/view/${climbUuid}`;
}

function ClimbActionsSheet({
  visible,
  climb,
  boardName,
  layoutId,
  sizeId,
  setIds,
  angle,
  onAddToQueue,
  onToggleFavorite,
  onClose,
}: ClimbActionsSheetProps) {
  const { t } = useTranslation('climbs');
  const { showToast } = useToast();
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (visible && climb) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible, climb]);

  const handleAddToQueue = useCallback(() => {
    onAddToQueue?.();
    onClose();
  }, [onAddToQueue, onClose]);

  const handleToggleFavorite = useCallback(() => {
    onToggleFavorite?.();
    onClose();
  }, [onToggleFavorite, onClose]);

  const handleShare = useCallback(async () => {
    if (!climb) return;
    const url = buildClimbUrl(boardName, layoutId, sizeId, setIds, angle, climb.uuid);
    try {
      await Share.share({ message: `${climb.name}\n${url}`, url });
    } finally {
      onClose();
    }
  }, [climb, boardName, layoutId, sizeId, setIds, angle, onClose]);

  const handleCopyLink = useCallback(async () => {
    if (!climb) return;
    const url = buildClimbUrl(boardName, layoutId, sizeId, setIds, angle, climb.uuid);
    await Clipboard.setStringAsync(url);
    showToast(t('mobile.climbActions.linkCopied'), 'info');
    onClose();
  }, [climb, boardName, layoutId, sizeId, setIds, angle, onClose, showToast, t]);

  const handleReport = useCallback(async () => {
    if (!climb) return;
    const reportUrl = `${WEB_BASE_URL}/${boardName}/${layoutId}/${sizeId}/${setIds}/${angle}/view/${climb.uuid}?report=true`;
    await WebBrowser.openBrowserAsync(reportUrl);
    onClose();
  }, [climb, boardName, layoutId, sizeId, setIds, angle, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const snapPoints = useMemo(() => ['40%'], []);

  return (
    <Sheet ref={sheetRef} snapPoints={snapPoints} onClose={handleClose} enablePanDownToClose>
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
          showSeparator
        />
        <ListRow
          title={t('mobile.climbActions.copyLink')}
          leading={<Icon name="copy" size={22} color={iosSystemColors.systemBlue} />}
          onPress={handleCopyLink}
          showSeparator
        />
        <ListRow
          title={t('mobile.climbActions.report')}
          leading={<Icon name="flag" size={22} color={iosSystemColors.systemOrange} />}
          onPress={handleReport}
          showSeparator={false}
        />
      </View>
    </Sheet>
  );
}

export { ClimbActionsSheet };

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing[2],
  },
});
