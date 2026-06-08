import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { ModalSheet } from '../ModalSheet';
import { ListRow } from '../ListRow';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type PlaylistActionsMenuProps = {
  visible: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/**
 * Owner-only action sheet for the playlist detail (Edit / Delete). The parent
 * wires Edit → open the form sheet and Delete → the confirm Alert.
 */
export function PlaylistActionsMenu({ visible, onEdit, onDelete, onClose }: PlaylistActionsMenuProps) {
  const { t } = useTranslation('playlists');
  const { systemColors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  // Track presented state so we never call dismiss() on a not-presented modal
  // (which leaves gorhom in a state where the next present() is a no-op — the
  // "nothing happens" bug). Mirrors LogAscentSheet.
  const isPresentedRef = useRef(false);
  // 30% leaves room for the two rows on short screens (e.g. iPhone SE landscape).
  const snapPoints = useMemo(() => ['30%'], []);

  useEffect(() => {
    if (visible && !isPresentedRef.current) {
      sheetRef.current?.present();
      isPresentedRef.current = true;
    } else if (!visible && isPresentedRef.current) {
      sheetRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    isPresentedRef.current = false;
    onClose();
  }, [onClose]);

  return (
    <ModalSheet ref={sheetRef} snapPoints={snapPoints} onDismiss={handleDismiss}>
      <View style={styles.content}>
        <ListRow
          title={t('detail.menu.edit')}
          leading={<Icon name="edit" size={22} color={systemColors.accent} />}
          onPress={onEdit}
          showSeparator
        />
        <ListRow
          title={t('detail.menu.delete')}
          leading={<Icon name="delete" size={22} color={iosSystemColors.systemRed} />}
          onPress={onDelete}
          showSeparator={false}
        />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing[2],
  },
});
