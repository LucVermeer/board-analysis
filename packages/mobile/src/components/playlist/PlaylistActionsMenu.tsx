import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { ListRow } from '../ListRow';
import { Icon } from '../Icon';
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
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['25%'], []);

  useEffect(() => {
    if (visible) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [visible]);

  return (
    <Sheet ref={sheetRef} snapPoints={snapPoints} onClose={onClose}>
      <View style={styles.content}>
        <ListRow
          title={t('detail.menu.edit')}
          leading={<Icon name="edit" size={22} color={iosSystemColors.systemBlue} />}
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing[2],
  },
});
