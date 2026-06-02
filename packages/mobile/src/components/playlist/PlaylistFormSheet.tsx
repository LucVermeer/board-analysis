import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';
import { ModalSheet } from '../ModalSheet';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { Button } from '../Button';
import { SwitchRow } from '../SwitchRow';
import { PlaylistPreviewSquare } from './PlaylistPreviewSquare';
import { PLAYLIST_COLORS } from './playlist-colors';
import { useTheme } from '../../providers/theme-provider';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

// Preset emoji palette for the icon picker (edit only). Mobile has no
// emoji-mart equivalent (it's DOM-only on web); a tap-to-pick row keeps the
// picker native and the value controlled.
const PRESET_ICONS = ['🔥', '💪', '🎯', '⭐', '🧗', '🪨', '📈', '❄️', '🌙', '⚡', '🏆', '🎸'] as const;

export type PlaylistFormValues = {
  name: string;
  description?: string;
  color?: string;
  /** Edit only. */
  icon?: string;
  /** Edit only. */
  isPublic?: boolean;
};

type PlaylistFormSheetProps = {
  mode: 'create' | 'edit';
  visible: boolean;
  submitting?: boolean;
  /** Seed values for edit mode. */
  playlist?: Playlist | null;
  onSubmit: (values: PlaylistFormValues) => void;
  onClose: () => void;
};

/**
 * One sheet powering both create and edit (web ships two near-identical
 * drawers — `CreatePlaylistDrawer` / `PlaylistEditDrawer`). Fields mirror web:
 * name (required, ≤100), description (≤500), colour swatch; edit also exposes
 * an icon picker + a public/private toggle. Validation + reset-on-open mirror
 * web; the parent owns the mutation, toasts, and cache refresh.
 */
export function PlaylistFormSheet({ mode, visible, submitting, playlist, onSubmit, onClose }: PlaylistFormSheetProps) {
  const { t } = useTranslation('playlists');
  const { systemColors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const isEdit = mode === 'edit';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed (edit) or clear (create) the fields when the sheet opens, then drive
  // the gorhom modal off the `visible` prop. `isPresentedRef` guards against
  // calling dismiss() on a not-presented modal (which makes the next present()
  // a no-op) and is reset in onDismiss so a swipe-dismiss + reopen works.
  const isPresentedRef = useRef(false);
  useEffect(() => {
    if (visible && !isPresentedRef.current) {
      if (isEdit && playlist) {
        setName(playlist.name);
        setDescription(playlist.description ?? '');
        setColor(playlist.color);
        setIcon(playlist.icon);
        setIsPublic(playlist.isPublic);
      } else {
        setName('');
        setDescription('');
        setColor(undefined);
        setIcon(undefined);
        setIsPublic(false);
      }
      setError(null);
      sheetRef.current?.present();
      isPresentedRef.current = true;
    } else if (!visible && isPresentedRef.current) {
      sheetRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [visible, isEdit, playlist]);

  const handleDismiss = useCallback(() => {
    isPresentedRef.current = false;
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('edit.validation.nameRequired'));
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      setError(t('edit.validation.nameTooLong'));
      return;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length > DESCRIPTION_MAX) {
      setError(t('edit.validation.descriptionTooLong'));
      return;
    }
    setError(null);
    const values: PlaylistFormValues = {
      name: trimmedName,
      description: trimmedDescription || undefined,
      color,
    };
    if (isEdit) {
      values.icon = icon;
      values.isPublic = isPublic;
    }
    onSubmit(values);
  }, [name, description, color, icon, isPublic, isEdit, onSubmit, t]);

  const title = isEdit ? t('edit.title') : t('create.drawerTitle');
  const submitLabel = isEdit
    ? submitting
      ? t('edit.actions.saving')
      : t('edit.actions.save')
    : submitting
      ? t('create.submitting')
      : t('create.submit');

  const inputStyle = useMemo(
    () => [
      styles.input,
      {
        backgroundColor: systemColors.fill as string,
        color: systemColors.label as string,
        borderColor: systemColors.separator as string,
      },
    ],
    [systemColors],
  );

  const footer = (
    <Button title={submitLabel} onPress={handleSubmit} loading={submitting} disabled={submitting} size="large" />
  );

  return (
    <ModalSheet ref={sheetRef} snapPoints={['90%']} onDismiss={handleDismiss} scrollable footer={footer}>
      <View style={styles.body}>
        <View style={styles.header}>
          <PlaylistPreviewSquare color={color} icon={icon} size={56} />
          <Text variant="title3" style={styles.title}>
            {title}
          </Text>
        </View>

        <Text variant="footnote" style={styles.label}>
          {isEdit ? t('edit.fields.name') : t('create.fields.name')}
        </Text>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder={t('create.fields.namePlaceholder')}
          placeholderTextColor={systemColors.tertiaryLabel as string}
          maxLength={NAME_MAX}
          style={inputStyle}
          returnKeyType="done"
        />

        <Text variant="footnote" style={styles.label}>
          {isEdit ? t('edit.fields.description') : t('create.fields.description')}
        </Text>
        <BottomSheetTextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('create.fields.descriptionPlaceholder')}
          placeholderTextColor={systemColors.tertiaryLabel as string}
          maxLength={DESCRIPTION_MAX}
          multiline
          style={[inputStyle, styles.multiline]}
        />

        <Text variant="footnote" style={styles.label}>
          {isEdit ? t('edit.fields.color') : t('create.fields.color')}
        </Text>
        <View style={styles.swatchRow}>
          {PLAYLIST_COLORS.map((swatch) => {
            const selected = color === swatch;
            return (
              <Pressable
                key={swatch}
                onPress={() => setColor(selected ? undefined : swatch)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.swatch, { backgroundColor: swatch }, selected && styles.swatchSelected]}
              >
                {selected ? <Icon name="check.small" size={18} color={iosSystemColors.white} /> : null}
              </Pressable>
            );
          })}
        </View>

        {isEdit ? (
          <>
            <Text variant="footnote" style={styles.label}>
              {t('edit.fields.icon')}
            </Text>
            <View style={styles.swatchRow}>
              {PRESET_ICONS.map((preset) => {
                const selected = icon === preset;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => setIcon(selected ? undefined : preset)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.emojiChip,
                      { backgroundColor: systemColors.fill as string },
                      selected && styles.emojiChipSelected,
                    ]}
                  >
                    <Text style={styles.emoji} allowFontScaling={false}>
                      {preset}
                    </Text>
                  </Pressable>
                );
              })}
              {icon ? (
                <Pressable
                  onPress={() => setIcon(undefined)}
                  accessibilityRole="button"
                  style={[styles.removeChip, { borderColor: systemColors.separator as string }]}
                >
                  <Text variant="footnote" color={iosSystemColors.systemRed}>
                    {t('edit.fields.removeIcon')}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.switchWrap}>
              <SwitchRow
                label={t('edit.fields.visibility')}
                description={isPublic ? t('edit.fields.publicHint') : t('edit.fields.privateHint')}
                value={isPublic}
                onValueChange={setIsPublic}
              />
            </View>
          </>
        ) : null}

        {error ? (
          <Text variant="footnote" color={iosSystemColors.systemRed} style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[4],
    gap: spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[2],
  },
  title: {
    fontWeight: '700',
    flex: 1,
  },
  label: {
    fontWeight: '600',
    opacity: 0.6,
    marginTop: spacing[2],
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: 16,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
    marginTop: spacing[1],
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: iosSystemColors.white,
  },
  emojiChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiChipSelected: {
    borderWidth: 2,
    borderColor: brandColors.primary,
  },
  emoji: {
    fontSize: 22,
  },
  removeChip: {
    height: 40,
    paddingHorizontal: spacing[3],
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchWrap: {
    marginTop: spacing[2],
    marginHorizontal: -spacing[4],
  },
  error: {
    marginTop: spacing[2],
  },
});
