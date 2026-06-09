// Board sheet — "now on the wall" (the board-presence primary surface).
//
// A gorhom BottomSheetModal sibling of QueueSheet: same visible→present/dismiss
// split, GlassSheetBackground, FullWindowOverlay on iOS, stackBehavior="push".
// Renders the wall's now-on-the-wall hero, a VIRTUALIZED history list
// (BottomSheetFlatList — never .map), light stat tiles, and a SEPARATE
// "Switch board" footer row that opens the existing board switcher.
//
// State comes from `@boardsesh/board-presence-react`'s context (currentClimb +
// history + stats), which is inert when the `board-presence` flag is off — so
// this sheet is only ever opened from the BoardPill when the flag is on.

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { useBoardPresenceContext } from '@boardsesh/board-presence-react';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import type { Climb } from '@boardsesh/queue';
import { GlassSheetBackground } from '../GlassSheetBackground';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { AccessoryClimbThumbnail } from '../queue-control/AccessoryClimbThumbnail';
import { useTheme } from '../../providers/theme-provider';
import type { BoardConfig } from '../../providers/drawer-host-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { spacing, borderRadius } from '../../theme/tokens';

/** Minimal Climb shape the board-art thumbnail needs from a presence climb. */
function presenceClimbToThumbnailClimb(presenceClimb: BoardPresenceClimb): Climb {
  return {
    uuid: presenceClimb.climbUuid,
    name: presenceClimb.name ?? '',
    frames: presenceClimb.frames ?? '',
    setter_username: presenceClimb.setter ?? '',
    angle: presenceClimb.angle ?? 0,
    ascensionist_count: 0,
    difficulty: presenceClimb.grade ?? '',
    quality_average: '',
    stars: 0,
    difficulty_error: '',
    benchmark_difficulty: null,
  };
}

type BoardSheetProps = {
  visible: boolean;
  /** The active board label, shown as the sheet title + footer subtitle. */
  boardLabel: string | null;
  /**
   * Active board config for the climb thumbnails. Passed by the host (NOT read
   * via `useDrawerHost`) so BoardSheet stays out of the drawer-host require cycle
   * and doesn't subscribe to that volatile context — re-renders from it were
   * interfering with gorhom's `present()`, so the sheet never appeared.
   */
  boardConfig: BoardConfig | null;
  /** Request an animated close (header X) — host flips `visible` to false. */
  onClose: () => void;
  /** Fired AFTER the dismiss animation finishes so the host can unmount. */
  onDismissed: () => void;
  /** Open the existing board switcher (the separated "Switch board" control). */
  onSwitchBoard: () => void;
};

export function BoardSheet({ visible, boardLabel, boardConfig, onClose, onDismissed, onSwitchBoard }: BoardSheetProps) {
  const { t } = useTranslation('session');
  const insets = useSafeAreaInsets();
  const { systemColors, brandColors, sheet } = useTheme();
  const { formatGrade } = useGradeFormat();
  const sheetRef = useRef<BottomSheetModal>(null);

  const { currentClimb, history, stats } = useBoardPresenceContext();

  const snapPoints = useMemo(() => ['55%', '92%'], []);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={sheet.scrimOpacity}
        pressBehavior="close"
      />
    ),
    [sheet.scrimOpacity],
  );

  const keyExtractor = useCallback((item: BoardPresenceClimb) => `${item.climbUuid}-${item.seq}`, []);

  const renderHistoryItem = useCallback(
    ({ item }: { item: BoardPresenceClimb }) => (
      <HistoryRow
        climb={item}
        boardConfig={boardConfig}
        labelColor={systemColors.label}
        secondaryColor={systemColors.secondaryLabel}
        formattedGrade={item.grade ? formatGrade(item.grade) : null}
        gradeColor={getGradeColor(item.grade ?? '') ?? DEFAULT_GRADE_COLOR}
      />
    ),
    [boardConfig, systemColors.label, systemColors.secondaryLabel, formatGrade],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <NowOnTheWallHero
          climb={currentClimb}
          boardConfig={boardConfig}
          labelColor={systemColors.label}
          secondaryColor={systemColors.secondaryLabel}
          accentColor={brandColors.warning}
          surfaceColor={systemColors.secondaryBackground}
          formattedGrade={currentClimb?.grade ? formatGrade(currentClimb.grade) : null}
          gradeColor={getGradeColor(currentClimb?.grade ?? '') ?? DEFAULT_GRADE_COLOR}
        />
        {stats ? (
          <View style={styles.statsBlock}>
            <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionHeader}>
              {t('mobile.boardPresence.statsHeader')}
            </Text>
            <View style={styles.statTiles}>
              <StatTile
                value={String(stats.climbsSentCount)}
                label={t('mobile.boardPresence.statSentToday')}
                surfaceColor={systemColors.secondaryBackground}
                labelColor={systemColors.secondaryLabel}
                valueColor={systemColors.label}
              />
              <StatTile
                value={String(stats.distinctClimbersCount)}
                label={t('mobile.boardPresence.statClimbers')}
                surfaceColor={systemColors.secondaryBackground}
                labelColor={systemColors.secondaryLabel}
                valueColor={systemColors.label}
              />
              <StatTile
                value={stats.hardestGrade ? (formatGrade(stats.hardestGrade) ?? '–') : '–'}
                label={t('mobile.boardPresence.statHardest')}
                surfaceColor={systemColors.secondaryBackground}
                labelColor={systemColors.secondaryLabel}
                valueColor={systemColors.label}
              />
              <StatTile
                value={stats.topGrade ? (formatGrade(stats.topGrade) ?? '–') : '–'}
                label={t('mobile.boardPresence.statTopGrade')}
                surfaceColor={systemColors.secondaryBackground}
                labelColor={systemColors.secondaryLabel}
                valueColor={systemColors.label}
              />
            </View>
          </View>
        ) : null}
        {history.length > 0 ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionHeader}>
            {t('mobile.boardPresence.historyHeader')}
          </Text>
        ) : null}
      </View>
    ),
    [currentClimb, boardConfig, stats, history.length, systemColors, brandColors.warning, formatGrade, t],
  );

  const listEmpty = useMemo(
    () =>
      currentClimb ? null : (
        <View style={styles.empty}>
          <Icon name="lightbulb" size={36} color={systemColors.tertiaryLabel} />
          <Text variant="headline" color={systemColors.label} style={styles.emptyTitle}>
            {t('mobile.boardPresence.emptyTitle')}
          </Text>
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptyBody}>
            {t('mobile.boardPresence.emptyBody')}
          </Text>
        </View>
      ),
    [currentClimb, systemColors, t],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      stackBehavior="push"
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={onDismissed}
      handleIndicatorStyle={sheet.handleStyle}
      backgroundComponent={GlassSheetBackground}
      style={styles.sheet}
    >
      <View style={[styles.header, { borderBottomColor: systemColors.separator }]}>
        <Text variant="title3" color={systemColors.label} numberOfLines={1} style={styles.headerTitle}>
          {boardLabel ?? t('mobile.boardPresence.title')}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.boardPresence.close')}
        >
          <Icon name="close" size={20} color={systemColors.secondaryLabel} />
        </Pressable>
      </View>

      <BottomSheetFlatList
        data={history}
        keyExtractor={keyExtractor}
        renderItem={renderHistoryItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{ paddingBottom: spacing[4] }}
      />

      <Pressable
        onPress={onSwitchBoard}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.boardPresence.switchBoardAria')}
        style={[styles.footer, { borderTopColor: systemColors.separator, paddingBottom: insets.bottom + spacing[3] }]}
      >
        <View style={styles.footerText}>
          <Text variant="body" color={systemColors.label}>
            {t('mobile.boardPresence.switchBoard')}
          </Text>
          {boardLabel ? (
            <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={1}>
              {boardLabel}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron.right" size={16} color={systemColors.tertiaryLabel} />
      </Pressable>
    </BottomSheetModal>
  );
}

type HeroProps = {
  climb: BoardPresenceClimb | null;
  boardConfig: BoardConfig | null;
  labelColor: ColorValue;
  secondaryColor: ColorValue;
  accentColor: ColorValue;
  surfaceColor: ColorValue;
  formattedGrade: string | null;
  gradeColor: string;
};

function NowOnTheWallHero({
  climb,
  boardConfig,
  labelColor,
  secondaryColor,
  accentColor,
  surfaceColor,
  formattedGrade,
  gradeColor,
}: HeroProps) {
  const { t } = useTranslation('session');
  if (!climb) return null;

  const litBy = climb.sentByDisplayName?.trim();
  const setter = climb.setter?.trim();

  return (
    <View style={[styles.hero, { backgroundColor: surfaceColor }]}>
      <AccessoryClimbThumbnail climb={presenceClimbToThumbnailClimb(climb)} boardConfig={boardConfig} />
      <View style={styles.heroBody}>
        <View style={styles.heroNameRow}>
          <Text variant="headline" color={labelColor} numberOfLines={1} style={styles.heroName}>
            {climb.name ?? ''}
          </Text>
          {formattedGrade ? (
            <Text variant="headline" style={[styles.heroGrade, { color: gradeColor }]}>
              {formattedGrade}
            </Text>
          ) : null}
        </View>
        {setter ? (
          <Text variant="caption1" color={secondaryColor} numberOfLines={1}>
            {t('mobile.boardPresence.setByLine', { setter })}
          </Text>
        ) : null}
        {litBy ? (
          <Text variant="caption1" color={accentColor} numberOfLines={1}>
            {t('mobile.boardPresence.litByLine', { name: litBy })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type HistoryRowProps = {
  climb: BoardPresenceClimb;
  boardConfig: BoardConfig | null;
  labelColor: ColorValue;
  secondaryColor: ColorValue;
  formattedGrade: string | null;
  gradeColor: string;
};

const HistoryRow = function HistoryRowInner({
  climb,
  boardConfig,
  labelColor,
  secondaryColor,
  formattedGrade,
  gradeColor,
}: HistoryRowProps) {
  const { t } = useTranslation('session');
  const litBy = climb.sentByDisplayName?.trim();

  return (
    <View style={styles.historyRow}>
      <AccessoryClimbThumbnail climb={presenceClimbToThumbnailClimb(climb)} boardConfig={boardConfig} />
      <View style={styles.historyBody}>
        <Text variant="subheadline" color={labelColor} numberOfLines={1} style={styles.historyName}>
          {climb.name ?? ''}
        </Text>
        {litBy ? (
          <Text variant="caption1" color={secondaryColor} numberOfLines={1}>
            {t('mobile.boardPresence.litByLine', { name: litBy })}
          </Text>
        ) : null}
      </View>
      {formattedGrade ? (
        <Text variant="headline" style={[styles.historyGrade, { color: gradeColor }]}>
          {formattedGrade}
        </Text>
      ) : null}
    </View>
  );
};

type StatTileProps = {
  value: string;
  label: string;
  surfaceColor: ColorValue;
  labelColor: ColorValue;
  valueColor: ColorValue;
};

function StatTile({ value, label, surfaceColor, labelColor, valueColor }: StatTileProps) {
  return (
    <View style={[styles.statTile, { backgroundColor: surfaceColor }]}>
      <Text variant="title3" color={valueColor} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption1" color={labelColor} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    marginRight: spacing[3],
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    margin: spacing[4],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
  },
  heroBody: {
    flex: 1,
    gap: 2,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  heroName: {
    flex: 1,
  },
  heroGrade: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  sectionHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  statsBlock: {
    paddingBottom: spacing[2],
  },
  statTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  statTile: {
    flexGrow: 1,
    flexBasis: '47%',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    gap: 2,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  historyBody: {
    flex: 1,
    gap: 2,
  },
  historyName: {
    fontWeight: '600',
  },
  historyGrade: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  empty: {
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    gap: 2,
  },
});
