import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import {
  GET_PLAYLISTS_FOR_CLIMB,
  type GetPlaylistsForClimbQueryResponse,
} from '@boardsesh/graphql/operations/playlists';
import { playlistMembershipStore } from '@boardsesh/climb-actions';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ListRow } from '../ListRow';
import { getHttpClient } from '../../lib/graphql/client';
import { usePlaylistsContext, type Playlist } from '../../providers/playlists-provider';
import { useTheme } from '../../providers/theme-provider';
import { sortPlaylistsByName } from '../../lib/sort-filter-playlists';
import { iosSystemColors } from '../../theme/ios-colors';
import { borderRadius, spacing } from '../../theme/tokens';
import { PLAYLIST_COLORS, isValidHexColor } from './playlist-colors';
import { NAME_MAX } from './playlist-form-values';

// One-tap emoji shortcuts for the compact inline create form. The full emoji
// picker (system keyboard + description field) lives on the playlist edit
// screen; the inline form stays lightweight so it fits the reaction overlay's
// floating card.
const QUICK_EMOJI = ['🔥', '💪', '🎯', '⭐', '🧗', '🪨', '🏆'] as const;

type InlinePlaylistPickerProps = {
  climb: Climb;
  /** Angle the membership add targets (the climb's board config angle). */
  angle: number;
  boardName: BoardName;
  layoutId: number;
  /**
   * Text input host: inject `BottomSheetTextInput` when rendered inside a
   * `ModalSheet` (so the keyboard pushes the sheet), and the plain RN
   * `TextInput` when rendered inside the reaction overlay. Keeps this body
   * presentation-agnostic — it never mounts a sheet or overlay of its own,
   * which is the whole point (#3294: stacking a second native sheet dismisses
   * the first).
   */
  TextInputComponent: ComponentType<TextInputProps>;
  /** Rendered on the left of the header when the host wants a back affordance
   *  (the reaction overlay returns to its action list; the sheet omits it). */
  onBack?: () => void;
};

/**
 * Membership-aware "add to playlist" body: a toggle list (checkmark = the climb
 * is in that playlist; tap to add or remove) plus an inline create form. Shared
 * by the reaction overlay (`ClimbReactionMenu`) and the add-to-playlist
 * `ModalSheet` (`AddToPlaylistSheet`).
 *
 * Feedback is inline, never a toast: a toast fired while a `FullWindowOverlay`
 * or native sheet is on screen renders behind it and is invisible. Success is
 * the optimistic checkmark itself; failures revert the optimistic state and
 * surface an inline error line.
 */
export function InlinePlaylistPicker({
  climb,
  angle,
  boardName,
  layoutId,
  TextInputComponent,
  onBack,
}: InlinePlaylistPickerProps) {
  const { t } = useTranslation('climbs');
  const { t: tc } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const queryClient = useQueryClient();
  const { playlists, addToPlaylist, removeFromPlaylist, createPlaylist, isLoading, isAuthenticated } =
    usePlaylistsContext();

  // This climb's current memberships. The provider's membership map is empty
  // (see use-mobile-climb-actions-data) and the shared chip store is only
  // populated behind an opt-in setting, so fetch the single climb's memberships
  // directly — the source of truth for the checkmarks. Optimistic writes go
  // through `setQueryData` on this key so they survive the host unmounting and
  // re-mounting the picker (the reaction overlay does exactly that on back).
  const membershipKey = useMemo(
    () => ['playlistsForClimb', boardName, layoutId, climb.uuid] as const,
    [boardName, layoutId, climb.uuid],
  );
  const { data: memberUuids, isLoading: membershipLoading } = useQuery({
    queryKey: membershipKey,
    queryFn: async (): Promise<string[]> => {
      const response = await getHttpClient().request<GetPlaylistsForClimbQueryResponse>(GET_PLAYLISTS_FOR_CLIMB, {
        input: { boardType: boardName, layoutId, climbUuid: climb.uuid },
      });
      return response.playlistsForClimb;
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  const members = useMemo(() => new Set(memberUuids ?? []), [memberUuids]);

  const [error, setError] = useState<string | null>(null);

  const sortedPlaylists = useMemo(() => sortPlaylistsByName(playlists), [playlists]);

  // Write a membership set to the cache and mirror it into the shared chip store
  // (so climb-list playlist chips reflect the change without a refetch).
  const writeMembership = useCallback(
    (nextUuids: string[]) => {
      queryClient.setQueryData<string[]>(membershipKey, nextUuids);
      playlistMembershipStore.setMembershipForClimb(climb.uuid, nextUuids);
    },
    [queryClient, membershipKey, climb.uuid],
  );

  // Toggle one playlist's membership. Rows are gated behind the membership load
  // below, so the initial fetch has resolved before any toggle. Reads and writes
  // are surgical — computed against the *latest* cache each time — so overlapping
  // toggles (or a failure while another is in flight) never clobber each other.
  const handleToggle = useCallback(
    async (playlist: Playlist) => {
      const before = queryClient.getQueryData<string[]>(membershipKey) ?? [...members];
      const willBeMember = !before.includes(playlist.uuid);
      setError(null);
      writeMembership(willBeMember ? [...before, playlist.uuid] : before.filter((uuid) => uuid !== playlist.uuid));
      try {
        if (willBeMember) {
          // The backend resolvers key on playlists.uuid, so the uuid (not the
          // bigserial id) goes on the wire.
          await addToPlaylist(playlist.uuid, climb.uuid, angle);
        } else {
          await removeFromPlaylist(playlist.uuid, climb.uuid);
        }
      } catch (toggleError) {
        // Undo ONLY this row's change against the current cache — not a stale
        // snapshot — so a sibling toggle that succeeded meanwhile is preserved.
        const current = queryClient.getQueryData<string[]>(membershipKey) ?? [];
        writeMembership(
          willBeMember ? current.filter((uuid) => uuid !== playlist.uuid) : [...new Set([...current, playlist.uuid])],
        );
        setError(t(willBeMember ? 'actions.playlist.toast.addFailed' : 'actions.playlist.toast.removeFailed'));
        if (__DEV__) {
          console.warn('[playlist] toggle membership failed', {
            playlistUuid: playlist.uuid,
            climbUuid: climb.uuid,
            add: willBeMember,
            error: toggleError,
          });
        }
      }
    },
    [queryClient, membershipKey, members, writeMembership, addToPlaylist, removeFromPlaylist, climb.uuid, angle, t],
  );

  // === Inline create form ===
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const resetCreate = useCallback(() => {
    setName('');
    setColor(undefined);
    setIcon(undefined);
    setCreateError(null);
  }, []);

  const handleOpenCreate = useCallback(() => {
    setError(null);
    resetCreate();
    setCreateOpen(true);
  }, [resetCreate]);

  const handleCloseCreate = useCallback(() => {
    resetCreate();
    setCreateOpen(false);
  }, [resetCreate]);

  const handleSubmitCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError(t('actions.playlist.validation.nameRequired'));
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setCreateError(t('actions.playlist.validation.nameTooLong'));
      return;
    }
    setSubmitting(true);
    setCreateError(null);
    // Create and add are separate operations with separate failure handling: if
    // the playlist is created but the add fails, we must NOT report "create
    // failed" and leave the name in the form, or a retry creates a duplicate.
    let created;
    try {
      created = await createPlaylist(trimmed, undefined, color, icon, { boardType: boardName, layoutId });
    } catch (submitError) {
      // Inline, not a toast — the picker (and its host overlay/sheet) stays up.
      setCreateError(t('actions.playlist.toast.createFailed'));
      setSubmitting(false);
      if (__DEV__) {
        console.warn('[playlist] inline create failed', {
          climbUuid: climb.uuid,
          boardName,
          layoutId,
          error: submitError,
        });
      }
      return;
    }
    // Playlist exists now; close the form so a retry can't duplicate it. The new
    // (still-unchecked) playlist is already in the list to tap if the add fails.
    setCreateOpen(false);
    resetCreate();
    try {
      await addToPlaylist(created.uuid, climb.uuid, angle);
      // Cancel any in-flight membership fetch (it was sent before this playlist
      // existed) so it can't overwrite the new checkmark, then optimistically add.
      await queryClient.cancelQueries({ queryKey: membershipKey });
      const current = queryClient.getQueryData<string[]>(membershipKey) ?? [...members];
      writeMembership([...new Set([...current, created.uuid])]);
    } catch (addError) {
      setError(t('actions.playlist.toast.addFailed'));
      if (__DEV__) {
        console.warn('[playlist] created playlist but failed to add climb', {
          playlistUuid: created.uuid,
          climbUuid: climb.uuid,
          error: addError,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    color,
    icon,
    createPlaylist,
    boardName,
    layoutId,
    addToPlaylist,
    climb.uuid,
    angle,
    resetCreate,
    queryClient,
    membershipKey,
    members,
    writeMembership,
    t,
  ]);

  const inputStyle = useMemo(
    () => [
      styles.input,
      { backgroundColor: systemColors.fill, color: systemColors.label, borderColor: systemColors.separator },
    ],
    [systemColors],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={tc('actions.back')}
            hitSlop={8}
            style={styles.backButton}
          >
            <Icon name="chevron.left" size={20} color={systemColors.label} />
          </Pressable>
        ) : (
          <Icon name="playlist" size={20} color={systemColors.accent} />
        )}
        <Text variant="headline" style={styles.headerTitle} numberOfLines={1}>
          {t('actions.playlist.popover.title')}
        </Text>
        {isAuthenticated && !createOpen ? (
          <Pressable
            onPress={handleOpenCreate}
            accessibilityRole="button"
            accessibilityLabel={t('actions.playlist.popover.createNew')}
            hitSlop={8}
            style={[styles.createButton, { backgroundColor: systemColors.fill }]}
          >
            <Icon name="plus" size={18} color={brandColors.primary} />
          </Pressable>
        ) : null}
      </View>

      {createOpen ? (
        <View style={styles.createForm}>
          <TextInputComponent
            value={name}
            onChangeText={(text) => {
              setCreateError(null);
              setName(text);
            }}
            placeholder={t('actions.playlist.create.namePlaceholder')}
            placeholderTextColor={systemColors.tertiaryLabel}
            maxLength={NAME_MAX}
            style={inputStyle}
            returnKeyType="done"
            autoFocus
            onSubmitEditing={() => {
              void handleSubmitCreate();
            }}
          />
          <View style={styles.swatchRow}>
            {PLAYLIST_COLORS.map((swatch) => {
              const selected = color === swatch;
              return (
                <Pressable
                  key={swatch}
                  onPress={() => setColor(selected ? undefined : swatch)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch, borderColor: systemColors.separator },
                    selected && styles.swatchSelected,
                  ]}
                >
                  {selected ? <Icon name="check.small" size={14} color={iosSystemColors.white} /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.emojiRow}>
            {QUICK_EMOJI.map((preset) => {
              const selected = icon === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setIcon(selected ? undefined : preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.emojiChip,
                    { backgroundColor: systemColors.fill },
                    selected && [styles.emojiChipSelected, { borderColor: brandColors.primary }],
                  ]}
                >
                  <Text style={styles.emoji} allowFontScaling={false}>
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {createError ? (
            <Text variant="footnote" color={iosSystemColors.systemRed} style={styles.errorText}>
              {createError}
            </Text>
          ) : null}
          <View style={styles.createActions}>
            <Pressable
              onPress={handleCloseCreate}
              accessibilityRole="button"
              accessibilityLabel={tc('actions.cancel')}
              hitSlop={8}
              style={styles.cancelButton}
              disabled={submitting}
            >
              <Text variant="body" color={systemColors.secondaryLabel}>
                {tc('actions.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleSubmitCreate();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('actions.playlist.create.submit')}
              hitSlop={8}
              style={[styles.submitButton, { backgroundColor: brandColors.primary }]}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={iosSystemColors.white} />
              ) : (
                <Text variant="body" color={iosSystemColors.white} style={styles.submitLabel}>
                  {t('actions.playlist.create.submit')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text variant="footnote" color={iosSystemColors.systemRed} style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {!isAuthenticated ? (
        <View style={styles.message}>
          <Text variant="subheadline" color={iosSystemColors.systemGray}>
            {t('actions.playlist.popover.signInBlurb')}
          </Text>
        </View>
      ) : isLoading || membershipLoading ? (
        <View style={styles.message}>
          <ActivityIndicator />
        </View>
      ) : sortedPlaylists.length === 0 ? (
        !createOpen ? (
          <View style={styles.message}>
            <Text variant="subheadline" color={iosSystemColors.systemGray}>
              {t('actions.playlist.popover.empty')}
            </Text>
          </View>
        ) : null
      ) : (
        sortedPlaylists.map((playlist, index) => {
          const accent = playlist.color && isValidHexColor(playlist.color) ? playlist.color : brandColors.primary;
          const member = members.has(playlist.uuid);
          return (
            <ListRow
              key={playlist.id}
              title={playlist.name}
              subtitle={t('multiboardList.count', { count: playlist.climbCount })}
              leading={<Icon name="playlist" size={22} color={accent} />}
              trailing={member ? <Icon name="check.small" size={18} color={brandColors.primary} /> : undefined}
              onPress={() => {
                void handleToggle(playlist);
              }}
              accessibilityLabel={playlist.name}
              accessibilityHint={member ? t('actions.playlist.toast.removed') : t('actions.playlist.toast.added')}
              showSeparator={index < sortedPlaylists.length - 1}
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  backButton: {
    width: spacing[6],
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
  },
  createButton: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createForm: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: 16,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: iosSystemColors.white,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  emojiChip: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiChipSelected: {
    borderWidth: 2,
  },
  emoji: {
    fontSize: 20,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[1],
  },
  cancelButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  submitButton: {
    minWidth: 96,
    height: spacing[10],
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  submitLabel: {
    fontWeight: '600',
  },
  message: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
  },
  errorText: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
});
