import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { useTheme } from '../../../src/providers/theme-provider';
import { useSetterStats } from '../../../src/lib/graphql/hooks';
import { emitSetterSelection } from '../../../src/lib/filter-handoff';
import { hapticSelection } from '../../../src/lib/haptics';
import { iosSystemColors } from '../../../src/theme/ios-colors';
import { spacing } from '../../../src/theme/tokens';

const SEARCH_DEBOUNCE_MS = 250;

type SetterStat = { setterUsername: string; climbCount: number };

/** Stable hairline separator — passed to FlashList by reference so it isn't a
 *  fresh component type each render (which would remount every separator). The
 *  separator colour is theme-static, so no per-render props are needed. */
const SetterSeparator = memo(function SetterSeparator() {
  return <View style={[styles.separator, { backgroundColor: iosSystemColors.separator }]} />;
});

type SetterRowProps = {
  setter: SetterStat;
  isSelected: boolean;
  onToggle: (username: string) => void;
};

/** Memoized row so toggling one setter only re-renders that row, not the whole
 *  windowed list. Pulls `t` / `brandColors` from hooks rather than props so the
 *  parent's `renderItem` identity stays stable across selection changes. */
const SetterRow = memo(function SetterRow({ setter, isSelected, onToggle }: SetterRowProps) {
  const { t } = useTranslation('climbs');
  const { brandColors } = useTheme();
  return (
    <Pressable
      onPress={() => onToggle(setter.setterUsername)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={setter.setterUsername}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text variant="body">{setter.setterUsername}</Text>
        <Text variant="footnote" style={styles.count}>
          {t('mobile.search.climbsCount', { count: setter.climbCount })}
        </Text>
      </View>
      {isSelected ? <Icon name="check.small" size={20} color={brandColors.primary} /> : null}
    </Pressable>
  );
});

type Params = {
  boardName?: string;
  layoutId?: string;
  sizeId?: string;
  setIds?: string;
  angle?: string;
  selected?: string;
};

export default function SettersPicker() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors } = useTheme();

  const initialSelected = useMemo<string[]>(() => {
    if (!params.selected) return [];
    // Older sessions used a comma-joined string; new sessions JSON-encode the
    // list (setter usernames can contain commas).
    try {
      const parsed: unknown = JSON.parse(params.selected);
      if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === 'string');
    } catch {
      // Fall through to legacy comma-split for backwards compat.
    }
    return params.selected.split(',').filter(Boolean);
  }, [params.selected]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  // Mirror of `selected` so the stable `renderRow` can look up per-row selection
  // without listing the whole Set as a dep (which would recreate `renderRow` —
  // and thus re-render every windowed row — on each toggle). FlashList is told to
  // re-render via `extraData={selected}` instead.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearchInput(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const queryInput = useMemo(
    () => ({
      boardName: params.boardName ?? '',
      layoutId: Number(params.layoutId ?? 0),
      sizeId: Number(params.sizeId ?? 0),
      setIds: params.setIds ?? '',
      angle: Number(params.angle ?? 0),
      ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
    }),
    [params.boardName, params.layoutId, params.sizeId, params.setIds, params.angle, debouncedSearch],
  );

  const hasBoardConfig = !!params.boardName;

  const { data: setters, isLoading } = useSetterStats(queryInput, hasBoardConfig);

  const done = useCallback(() => {
    emitSetterSelection(Array.from(selected));
    router.back();
  }, [router, selected]);

  const cancel = useCallback(() => {
    // Swipe-down also dismisses without applying — same intent as tapping Cancel.
    router.back();
  }, [router]);

  const clear = useCallback(() => {
    hapticSelection();
    setSelected(new Set());
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={done} hitSlop={8} accessibilityRole="button">
          <Text variant="subheadline" color={brandColors.primary} style={styles.headerAction}>
            {t('mobile.filter.done')}
          </Text>
        </Pressable>
      ),
      headerLeft: () => (
        <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button">
          <Text variant="subheadline" color={brandColors.primary}>
            {t('mobile.filter.cancel')}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, done, cancel, t, brandColors]);

  const toggle = useCallback((username: string) => {
    hapticSelection();
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: SetterStat }) => (
      <SetterRow setter={item} isSelected={selectedRef.current.has(item.setterUsername)} onToggle={toggle} />
    ),
    [toggle],
  );

  return (
    <View style={[styles.container, { backgroundColor: systemColors.background }]}>
      <View style={[styles.searchBarWrapper, { backgroundColor: systemColors.secondaryBackground }]}>
        <Icon name="search" size={16} color={iosSystemColors.systemGray} />
        <TextInput
          value={searchInput}
          onChangeText={handleSearchChange}
          placeholder={t('mobile.filter.searchSetters')}
          placeholderTextColor={iosSystemColors.systemGray}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, { color: systemColors.label }]}
        />
      </View>

      {selected.size > 0 ? (
        <View style={styles.selectionBar}>
          <Text variant="footnote" style={styles.selectionCount}>
            {t('mobile.search.settersCount', { count: selected.size })}
          </Text>
          <Pressable onPress={clear} hitSlop={8} accessibilityRole="button">
            <Text variant="footnote" color={brandColors.primary}>
              {t('mobile.filter.clearAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <FlashList
          data={setters ?? []}
          extraData={selected}
          keyExtractor={(item) => item.setterUsername}
          renderItem={renderRow}
          ItemSeparatorComponent={SetterSeparator}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="subheadline" style={styles.emptyText}>
                {debouncedSearch.length > 0 ? t('mobile.emptyState.noMatches.title') : t('mobile.filter.noSetters')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 48,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  count: {
    opacity: 0.55,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing[4],
  },
  loading: {
    paddingTop: spacing[8],
    alignItems: 'center',
  },
  empty: {
    paddingTop: spacing[10],
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.55,
  },
  headerAction: {
    fontWeight: '600',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  selectionCount: {
    opacity: 0.55,
  },
});
