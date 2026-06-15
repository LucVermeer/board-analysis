import { memo, useMemo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RecentBoardSerial } from '@boardsesh/graphql/operations';
import type { BoardName } from '@boardsesh/shared-schema';
import { useTheme } from '../../providers/theme-provider';
import { spacing, borderRadius } from '../../theme/tokens';
import { hapticSelection } from '../../lib/haptics';
import { formatRelativeTime } from '../../lib/format-relative-time';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { AccessoryClimbThumbnail } from '../queue-control/AccessoryClimbThumbnail';
import { getBoardConfigLabel } from './recent-serial-helpers';

const THUMBNAIL_SIZE = 56;

type RecentSerialRowProps = {
  serial: RecentBoardSerial;
  onPress: (serial: RecentBoardSerial) => void;
};

/**
 * One recently-connected controller in the "create a board" flow. Leads with a
 * preview of the last climb the user sent on it, shows the config + when it was
 * last connected, and signals whether it's already saved as an owned board
 * (trailing "Saved" tag) or still needs creating (trailing chevron). Memoized
 * because it renders inside a FlashList that re-renders on every recents update.
 */
export const RecentSerialRow = memo(function RecentSerialRow({ serial, onPress }: RecentSerialRowProps) {
  const { systemColors, brandColors } = useTheme();
  const { t } = useTranslation('boards');

  const configLabel = useMemo(
    () => getBoardConfigLabel(serial.boardName as BoardName, serial.layoutId, serial.sizeId),
    [serial.boardName, serial.layoutId, serial.sizeId],
  );
  const connectedLabel = useMemo(
    () => t('mobile.create.connectedAgo', { time: formatRelativeTime(serial.updatedAt) }),
    [serial.updatedAt, t],
  );

  const lastClimb = serial.lastClimb;
  // AccessoryClimbThumbnail wants the full BoardConfig (incl. angle); the serial
  // config has no angle, so use the angle the climb was sent at (irrelevant to
  // hold positions, but the type requires it).
  const thumbnailBoardConfig = useMemo(
    () => ({
      boardName: serial.boardName,
      layoutId: serial.layoutId,
      sizeId: serial.sizeId,
      setIds: serial.setIds,
      angle: lastClimb?.angle ?? 40,
    }),
    [serial.boardName, serial.layoutId, serial.sizeId, serial.setIds, lastClimb?.angle],
  );

  const lastSentLabel = lastClimb?.name
    ? lastClimb.gradeName
      ? t('mobile.create.lastSent', { climbName: lastClimb.name, grade: lastClimb.gradeName })
      : t('mobile.create.lastSentName', { climbName: lastClimb.name })
    : null;

  const isOwned = serial.ownedBoard != null;
  const ownedName = serial.ownedBoard?.name;

  const accessibilityLabel = [
    configLabel,
    lastSentLabel,
    connectedLabel,
    isOwned ? t('mobile.create.savedStatus', { name: ownedName ?? '' }) : t('mobile.create.notSavedStatus'),
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress(serial);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={isOwned ? t('mobile.create.savedHint') : t('mobile.create.createHint')}
      style={({ pressed }) => [
        styles.row,
        { borderColor: systemColors.separator },
        pressed ? { backgroundColor: systemColors.fill } : null,
      ]}
    >
      {lastClimb?.frames ? (
        <AccessoryClimbThumbnail
          climb={{ frames: lastClimb.frames, mirrored: null }}
          boardConfig={thumbnailBoardConfig}
          size={THUMBNAIL_SIZE}
        />
      ) : (
        <View
          style={[
            styles.thumbnailPlaceholder,
            { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator },
          ]}
        >
          <Icon name="boards" size={24} color={systemColors.tertiaryLabel} />
        </View>
      )}

      <View style={styles.body}>
        <Text variant="headline" numberOfLines={1}>
          {isOwned && ownedName ? ownedName : configLabel}
        </Text>
        {isOwned && ownedName ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            {configLabel}
          </Text>
        ) : null}
        {lastSentLabel ? (
          <Text variant="subheadline" color={systemColors.secondaryLabel} numberOfLines={1}>
            {lastSentLabel}
          </Text>
        ) : null}
        <Text variant="caption1" color={systemColors.tertiaryLabel} numberOfLines={1}>
          {connectedLabel}
        </Text>
      </View>

      {isOwned ? (
        <Text variant="caption1" color={brandColors.success} style={styles.savedTag}>
          {t('mobile.create.saved')}
        </Text>
      ) : (
        <Icon name="chevron.right" size={18} color={systemColors.tertiaryLabel} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  savedTag: {
    fontWeight: '600',
  },
});
