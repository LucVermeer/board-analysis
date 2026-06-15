import { useMemo, useState } from 'react';
import { View, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { BoardName, UserBoard } from '@boardsesh/shared-schema';
import { ANGLES, normaliseSetIds } from '@boardsesh/board-config';
import { useMyRecentBoardSerials, useCreateBoard, useUpdateBoard } from '../../src/lib/graphql/hooks';
import { useSetActiveBoard } from '../../src/lib/graphql/use-active-board';
import { useToast } from '../../src/providers/toast-provider';
import { useTheme } from '../../src/providers/theme-provider';
import { hapticSelection } from '../../src/lib/haptics';
import { resolveBoardReturnTo } from '../../src/lib/boards/board-return-to';
import { getBoardConfigLabel, boardTypeLabel } from '../../src/components/board-discovery/recent-serial-helpers';
import { getBoardLayouts } from '../../src/lib/custom-board-options';
import { Text } from '../../src/components/Text';
import { Icon } from '../../src/components/Icon';
import { Button } from '../../src/components/Button';
import { ActivityIndicator } from '../../src/components/ActivityIndicator';
import { AccessoryClimbThumbnail } from '../../src/components/queue-control/AccessoryClimbThumbnail';
import { spacing, borderRadius } from '../../src/theme/tokens';

function defaultAngleForBoard(boardName: BoardName): number {
  const angles = ANGLES[boardName] ?? [];
  return angles.includes(40) ? 40 : (angles[0] ?? 40);
}

export default function NameBoard() {
  const router = useRouter();
  const { serialNumber, mode, returnTo } = useLocalSearchParams<{
    serialNumber?: string;
    mode?: string;
    returnTo?: string;
  }>();
  const boardReturnTo = resolveBoardReturnTo(returnTo);
  const isRename = mode === 'rename';
  const { t } = useTranslation('boards');
  const { systemColors } = useTheme();
  const { showToast } = useToast();

  const setActiveBoard = useSetActiveBoard();
  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const { data: recents, isLoading } = useMyRecentBoardSerials();

  const serial = useMemo(
    () => recents?.find((entry) => entry.serialNumber === serialNumber) ?? null,
    [recents, serialNumber],
  );

  const boardName = (serial?.boardName ?? 'kilter') as BoardName;
  const layoutName = serial
    ? (getBoardLayouts(boardName).find((layout) => layout.id === serial.layoutId)?.name ?? boardTypeLabel(boardName))
    : '';
  const defaultName = isRename ? (serial?.ownedBoard?.name ?? layoutName) : layoutName;

  const [name, setName] = useState<string | null>(null);
  const value = name ?? defaultName;

  const configLabel = serial ? getBoardConfigLabel(boardName, serial.layoutId, serial.sizeId) : '';

  const handleSave = async () => {
    if (!serial) return;
    const trimmed = value.trim() || layoutName;
    hapticSelection();
    try {
      let board: UserBoard;
      if (isRename && serial.ownedBoard) {
        board = await updateBoard.mutateAsync({ boardUuid: serial.ownedBoard.uuid, name: trimmed });
      } else {
        board = await createBoard.mutateAsync({
          boardType: boardName,
          layoutId: serial.layoutId,
          sizeId: serial.sizeId,
          setIds: normaliseSetIds(serial.setIds),
          name: trimmed,
          angle: defaultAngleForBoard(boardName),
          isOwned: true,
          serialNumber: serial.serialNumber,
        });
      }
      await setActiveBoard(board);
      router.dismissTo(boardReturnTo);
    } catch {
      showToast(t(isRename ? 'mobile.create.renameError' : 'mobile.custom.createError'), 'error');
    }
  };

  if (isLoading && !serial) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!serial) {
    return (
      <View style={styles.centered}>
        <Icon name="error" size={40} color={systemColors.tertiaryLabel} />
        <Text variant="headline" style={styles.notFoundTitle}>
          {t('mobile.create.notFound')}
        </Text>
        <Button title={t('mobile.create.back')} variant="outlined" onPress={() => router.back()} style={styles.cta} />
      </View>
    );
  }

  const lastClimb = serial.lastClimb;
  const isPending = createBoard.isPending || updateBoard.isPending;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Recap: what board this serial is, with its last-climb art if we have it. */}
      <View
        style={[
          styles.recap,
          { backgroundColor: systemColors.secondaryBackground, borderColor: systemColors.separator },
        ]}
      >
        {lastClimb?.frames ? (
          <AccessoryClimbThumbnail
            climb={{ frames: lastClimb.frames, mirrored: null }}
            boardConfig={{
              boardName: serial.boardName,
              layoutId: serial.layoutId,
              sizeId: serial.sizeId,
              setIds: serial.setIds,
              angle: lastClimb.angle ?? 40,
            }}
            size={64}
          />
        ) : (
          <View style={[styles.recapPlaceholder, { borderColor: systemColors.separator }]}>
            <Icon name="boards" size={28} color={systemColors.tertiaryLabel} />
          </View>
        )}
        <View style={styles.recapBody}>
          <Text variant="headline" numberOfLines={1}>
            {configLabel}
          </Text>
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            {t('mobile.create.serialLabel', { serial: serial.serialNumber })}
          </Text>
        </View>
      </View>

      {isRename ? (
        <View style={[styles.ownedNote, { backgroundColor: systemColors.fill }]}>
          <Icon name="info" size={18} color={systemColors.secondaryLabel} />
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.ownedNoteText}>
            {t('mobile.create.alreadyOwnedNote')}
          </Text>
        </View>
      ) : null}

      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.fieldLabel}>
        {t('mobile.create.nameLabel')}
      </Text>
      <TextInput
        value={value}
        onChangeText={setName}
        autoFocus
        selectTextOnFocus
        placeholder={layoutName}
        placeholderTextColor={systemColors.tertiaryLabel}
        maxLength={100}
        returnKeyType="done"
        onSubmitEditing={() => void handleSave()}
        style={[
          styles.input,
          {
            color: systemColors.label,
            borderColor: systemColors.separator,
            backgroundColor: systemColors.secondaryBackground,
          },
        ]}
      />

      <Button
        title={t(isRename ? 'mobile.create.renameSave' : 'mobile.create.createSave')}
        onPress={() => void handleSave()}
        variant="filled"
        size="large"
        disabled={value.trim().length === 0 || isPending}
        loading={isPending}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[4],
    gap: spacing[3],
  },
  recap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recapPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapBody: {
    flex: 1,
    gap: 2,
  },
  ownedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.md,
  },
  ownedNoteText: {
    flex: 1,
  },
  fieldLabel: {
    marginTop: spacing[2],
    textTransform: 'uppercase',
  },
  input: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  notFoundTitle: {
    marginTop: spacing[3],
    textAlign: 'center',
  },
  cta: {
    marginTop: spacing[4],
  },
});
