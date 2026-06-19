import { memo, useCallback, useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import { Icon } from '../src/components/Icon';
import { PressableSurface } from '../src/components/PressableSurface';
import { Text } from '../src/components/Text';
import { useBottomChromeMetrics } from '../src/hooks/use-bottom-chrome-metrics';
import { useStackScreenOptions } from '../src/hooks/use-stack-screen-options';
import { entries, latestEntryDate, type ChangelogCategory, type ChangelogEntry } from '../src/lib/changelog';
import { markChangelogSeen } from '../src/lib/changelog-seen';
import { reportError } from '../src/lib/error-reporting';
import { formatRelativeTime } from '../src/lib/format-relative-time';
import { openExternalUrl } from '../src/lib/open-url';
import { useTheme } from '../src/providers/theme-provider';
import { borderRadius, spacing } from '../src/theme/tokens';
import type { IconName } from '../src/components/icon-map';

// Each category maps to a confirmed icon-map glyph: a sparkle-ish "new" plus for
// new features, a bolt for improvements, and a wrench-equivalent for fixes. The
// icon-map has no wrench/hammer, so fixes reuse `success` (a check-circle) — it
// reads as "sorted out" and stays in the validated SFSymbol union.
const CATEGORY_ICONS: Record<ChangelogCategory, IconName> = {
  new: 'add.fill',
  improved: 'flash',
  fixed: 'success',
};

// Header chip showing which build the user is running. On an OTA-updated build,
// `Updates.createdAt` is the publish time of the JS bundle; on an embedded launch
// (no OTA applied yet) fall back to the native app version. Kept tiny + memoized
// so it never re-renders with the list.
const CurrentBuildChip = memo(function CurrentBuildChip() {
  const { t } = useTranslation('common');
  const { systemColors } = useTheme();

  const buildLabel = useMemo(() => {
    if (!Updates.isEmbeddedLaunch && Updates.createdAt) {
      return t('mobile.changelog.currentBuild', { date: formatRelativeTime(Updates.createdAt.toISOString()) });
    }
    // No OTA applied (embedded launch / dev): there's no publish date to show, so
    // fall back to the native app version with its own grammatical string.
    const nativeVersion = Application.nativeApplicationVersion;
    if (nativeVersion) return t('mobile.changelog.currentBuildVersion', { version: nativeVersion });
    return null;
  }, [t]);

  if (!buildLabel) return null;
  return (
    <View style={[styles.buildChip, { backgroundColor: systemColors.fill }]}>
      <Icon name="info" size={14} color={systemColors.secondaryLabel} />
      <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
        {buildLabel}
      </Text>
    </View>
  );
});

const CategoryChip = memo(function CategoryChip({ category }: { category: ChangelogCategory }) {
  const { t } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const tint =
    category === 'new' ? brandColors.primaryFill : category === 'improved' ? brandColors.warning : brandColors.success;
  return (
    <View style={[styles.categoryChip, { backgroundColor: systemColors.fill }]}>
      <Icon name={CATEGORY_ICONS[category]} size={12} color={tint} />
      <Text variant="caption2" color={tint} style={styles.categoryChipLabel}>
        {t(`mobile.changelog.category.${category}`)}
      </Text>
    </View>
  );
});

type ChangelogEntryRowProps = { entry: ChangelogEntry; onPress: (entry: ChangelogEntry) => void };

const ChangelogEntryRow = memo(function ChangelogEntryRow({ entry, onPress }: ChangelogEntryRowProps) {
  const { t } = useTranslation('common');
  const { systemColors } = useTheme();
  // Stable per-row handler so the memo isn't defeated by a fresh inline closure.
  const handlePress = useCallback(() => onPress(entry), [onPress, entry]);
  const pressable = Boolean(entry.prUrl);

  const body = (
    <View style={[styles.card, { backgroundColor: systemColors.secondaryBackground }]}>
      <View style={styles.cardHeader}>
        <CategoryChip category={entry.category} />
        <Text variant="caption1" color={systemColors.tertiaryLabel} numberOfLines={1} style={styles.cardDate}>
          {formatRelativeTime(entry.mergedAt)}
        </Text>
        {pressable ? <Icon name="chevron.right" size={14} color={systemColors.tertiaryLabel} /> : null}
      </View>
      <Text variant="body" style={styles.cardTitle}>
        {entry.title}
      </Text>
      {entry.body ? (
        <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.cardBody}>
          {entry.body}
        </Text>
      ) : null}
    </View>
  );

  if (!pressable) return body;
  return (
    <PressableSurface
      onPress={handlePress}
      feedback="opacity"
      opacityTo={0.7}
      accessibilityRole="button"
      accessibilityLabel={entry.title}
      accessibilityHint={t('mobile.changelog.viewPr')}
    >
      {body}
    </PressableSurface>
  );
});

const keyExtractor = (entry: ChangelogEntry) => `pr-${entry.prNumber}`;

export default function ChangelogScreen() {
  const { t } = useTranslation('common');
  const { systemColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const screenOptions = useStackScreenOptions();

  // Mark the changelog seen as soon as it opens so the More tab's "New" pill
  // clears. Fire-and-forget — a failed write just reshows the pill next launch.
  useEffect(() => {
    if (latestEntryDate) {
      markChangelogSeen(latestEntryDate).catch(reportError);
    }
  }, []);

  const handleOpenPr = useCallback((entry: ChangelogEntry) => {
    if (entry.prUrl) void openExternalUrl(entry.prUrl, 'changelog-pr');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChangelogEntry }) => <ChangelogEntryRow entry={item} onPress={handleOpenPr} />,
    [handleOpenPr],
  );

  return (
    <>
      <Stack.Screen options={{ ...screenOptions, title: t('mobile.changelog.title'), headerShown: true }} />
      {/* FlashList needs a parent with a bounded height; without this flex:1
          wrapper it collapses to zero height and renders nothing (mirrors
          licenses.tsx). */}
      <View style={styles.flex}>
        {entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <CurrentBuildChip />
            <Text variant="body" color={systemColors.secondaryLabel} style={styles.emptyText}>
              {t('mobile.changelog.empty')}
            </Text>
          </View>
        ) : (
          // FlashList v2 self-measures rows — `estimatedItemSize` was removed and
          // no longer typechecks (see licenses.tsx for the same note).
          <FlashList
            data={entries}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              paddingHorizontal: spacing[4],
              paddingTop: spacing[4],
              paddingBottom: bottomChrome.scrollBottomPadding + spacing[6],
            }}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.intro}>
                  {t('mobile.changelog.intro')}
                </Text>
                <CurrentBuildChip />
              </View>
            }
            ItemSeparatorComponent={Separator}
          />
        )}
      </View>
    </>
  );
}

const Separator = memo(function Separator() {
  return <View style={styles.separator} />;
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listHeader: {
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  intro: {
    lineHeight: 20,
  },
  buildChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  separator: {
    height: spacing[3],
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    gap: spacing[2],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cardDate: {
    flex: 1,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  categoryChipLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontWeight: '600',
    lineHeight: 22,
  },
  cardBody: {
    lineHeight: 20,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[6],
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
