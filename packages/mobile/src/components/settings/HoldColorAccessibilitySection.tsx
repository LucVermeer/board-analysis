import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toBoardName } from '@boardsesh/board-config';
import type { BoardName } from '@boardsesh/shared-schema';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { ListRow } from '../ListRow';
import { ModalSheet } from '../ModalSheet';
import { SectionHeader } from '../SectionHeader';
import { SegmentedControl } from '../SegmentedControl';
import { Text } from '../Text';
import { useTheme } from '../../providers/theme-provider';
import { useActiveBoard } from '../../lib/graphql/use-active-board';
import {
  DEFAULT_HOLD_COLOR_SIGNATURE,
  HOLD_COLOR_OVERRIDE_ROLES,
  getDefaultHoldRoleColor,
  getEffectiveHoldRoleColor,
  hasHoldColorOverrides,
  hexToRgb,
  normalizeHexColor,
  parseRgbChannel,
  rgbToHex,
  useHoldColorOverrides,
  type HoldColorOverrideRole,
  type RgbColor,
} from '../../lib/hold-color-overrides';
import { borderRadius, spacing } from '../../theme/tokens';

type ColorMode = 'default' | 'user';

function labelForRole(t: TFunction<'common'>, role: HoldColorOverrideRole): string {
  switch (role) {
    case 'STARTING':
      return t('mobile.more.accessibility.roles.starting');
    case 'HAND':
      return t('mobile.more.accessibility.roles.hand');
    case 'FINISH':
      return t('mobile.more.accessibility.roles.finish');
    case 'FOOT':
      return t('mobile.more.accessibility.roles.foot');
  }
}

function rgbTextFromHex(color: string): RgbColorText {
  const rgb = hexToRgb(color) ?? { red: 0, green: 0, blue: 0 };
  return {
    red: String(rgb.red),
    green: String(rgb.green),
    blue: String(rgb.blue),
  };
}

type RgbColorText = {
  red: string;
  green: string;
  blue: string;
};

function rgbFromText(rgbText: RgbColorText): RgbColor | null {
  const red = parseRgbChannel(rgbText.red);
  const green = parseRgbChannel(rgbText.green);
  const blue = parseRgbChannel(rgbText.blue);
  if (red === null || green === null || blue === null) return null;
  return { red, green, blue };
}

function boardNameFromActiveBoard(boardType: string | undefined): BoardName {
  return toBoardName(boardType) ?? 'kilter';
}

export function HoldColorAccessibilitySection() {
  const { t } = useTranslation('common');
  const { systemColors } = useTheme();
  const { data: activeBoard } = useActiveBoard();
  const boardName = boardNameFromActiveBoard(activeBoard?.boardType);
  const { overrides, setRoleOverride, resetOverrides, signature } = useHoldColorOverrides();
  const [selectedRole, setSelectedRole] = useState<HoldColorOverrideRole | null>(null);
  const hasOverrides = signature !== DEFAULT_HOLD_COLOR_SIGNATURE && hasHoldColorOverrides(overrides);

  const handleSaveRole = useCallback(
    (role: HoldColorOverrideRole, color: string | null) => {
      setRoleOverride(role, color);
      setSelectedRole(null);
    },
    [setRoleOverride],
  );

  return (
    <View style={styles.section}>
      <SectionHeader title={t('mobile.more.accessibility.title')} />
      <View style={[styles.card, { backgroundColor: systemColors.secondaryBackground }]}>
        <View style={styles.header}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.description}>
            {t('mobile.more.accessibility.description')}
          </Text>
          {hasOverrides ? (
            <Pressable accessibilityRole="button" onPress={resetOverrides} style={styles.resetButton}>
              <Text variant="footnote" color={systemColors.accent}>
                {t('mobile.more.accessibility.resetAll')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {HOLD_COLOR_OVERRIDE_ROLES.map((role, index) => {
          const roleOverride = overrides[role];
          const swatchColor = getEffectiveHoldRoleColor(boardName, role, overrides);
          return (
            <ListRow
              key={role}
              title={labelForRole(t, role)}
              subtitle={
                roleOverride ? t('mobile.more.accessibility.mode.user') : t('mobile.more.accessibility.mode.default')
              }
              leading={<ColorSwatch color={swatchColor} />}
              trailing={roleOverride ? <Icon name="check.small" size={20} color={systemColors.accent} /> : undefined}
              showChevron
              showSeparator={index < HOLD_COLOR_OVERRIDE_ROLES.length - 1}
              onPress={() => setSelectedRole(role)}
            />
          );
        })}
      </View>
      <HoldColorPickerSheet
        role={selectedRole}
        boardName={boardName}
        currentColor={selectedRole ? (overrides[selectedRole] ?? null) : null}
        onSave={handleSaveRole}
        onClose={() => setSelectedRole(null)}
      />
    </View>
  );
}

function ColorSwatch({ color }: { color: string }) {
  const { systemColors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.swatch, { backgroundColor: color, borderColor: systemColors.separator }]}
    />
  );
}

type HoldColorPickerSheetProps = {
  role: HoldColorOverrideRole | null;
  boardName: BoardName;
  currentColor: string | null;
  onSave: (role: HoldColorOverrideRole, color: string | null) => void;
  onClose: () => void;
};

function HoldColorPickerSheet({ role, boardName, currentColor, onSave, onClose }: HoldColorPickerSheetProps) {
  const { t } = useTranslation('common');
  const { systemColors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [mode, setMode] = useState<ColorMode>('default');
  const [rgbText, setRgbText] = useState<RgbColorText>({ red: '0', green: '0', blue: '0' });
  const isPresentedRef = useRef(false);

  const modeOptions = useMemo<{ key: ColorMode; label: string }[]>(
    () => [
      { key: 'default', label: t('mobile.more.accessibility.mode.default') },
      { key: 'user', label: t('mobile.more.accessibility.mode.user') },
    ],
    [t],
  );

  useEffect(() => {
    if (role && !isPresentedRef.current) {
      const seedColor = currentColor ?? getDefaultHoldRoleColor(boardName, role, 'led');
      setMode(currentColor ? 'user' : 'default');
      setRgbText(rgbTextFromHex(seedColor));
      sheetRef.current?.present();
      isPresentedRef.current = true;
    } else if (!role && isPresentedRef.current) {
      sheetRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [boardName, currentColor, role]);

  const resolvedRgb = mode === 'user' ? rgbFromText(rgbText) : null;
  const resolvedHex = resolvedRgb ? rgbToHex(resolvedRgb) : null;
  const previewColor =
    mode === 'user' && resolvedHex && role ? resolvedHex : role ? getDefaultHoldRoleColor(boardName, role) : '#000000';
  const showValidationError = mode === 'user' && resolvedHex === null;

  const handleDismiss = useCallback(() => {
    isPresentedRef.current = false;
    onClose();
  }, [onClose]);

  const handleModeSelect = useCallback(
    (nextMode: ColorMode) => {
      setMode(nextMode);
      if (nextMode === 'user' && role) {
        const seedColor = currentColor ?? getDefaultHoldRoleColor(boardName, role, 'led');
        const normalizedSeed = normalizeHexColor(seedColor);
        if (normalizedSeed) setRgbText(rgbTextFromHex(normalizedSeed));
      }
    },
    [boardName, currentColor, role],
  );

  const handleSave = useCallback(() => {
    if (!role) return;
    if (mode === 'default') {
      onSave(role, null);
      return;
    }
    if (!resolvedHex) return;
    onSave(role, resolvedHex);
  }, [mode, onSave, resolvedHex, role]);

  const footer = (
    <Button
      title={t('mobile.more.accessibility.save')}
      onPress={handleSave}
      disabled={mode === 'user' && resolvedHex === null}
      size="large"
    />
  );

  const inputStyle = [
    styles.channelInput,
    {
      backgroundColor: systemColors.fill,
      color: systemColors.label,
      borderColor: showValidationError ? systemColors.accent : systemColors.separator,
    },
  ];

  return (
    <ModalSheet ref={sheetRef} snapPoints={['58%']} onDismiss={handleDismiss} footer={footer} stackBehavior="push">
      <View style={styles.pickerBody}>
        <View style={styles.pickerHeader}>
          <ColorSwatch color={previewColor} />
          <View style={styles.pickerTitleColumn}>
            <Text variant="headline">{role ? labelForRole(t, role) : t('mobile.more.accessibility.title')}</Text>
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              {t('mobile.more.accessibility.pickerSubtitle')}
            </Text>
          </View>
        </View>

        <SegmentedControl
          options={modeOptions}
          selectedKey={mode}
          onSelect={handleModeSelect}
          trackColor={systemColors.fill}
          accessibilityLabel={t('mobile.more.accessibility.modeLabel')}
        />

        {mode === 'user' ? (
          <View style={styles.rgbGrid}>
            <RgbChannelInput
              label={t('mobile.more.accessibility.channels.red')}
              value={rgbText.red}
              onChangeText={(red) => setRgbText((previous) => ({ ...previous, red }))}
              inputStyle={inputStyle}
            />
            <RgbChannelInput
              label={t('mobile.more.accessibility.channels.green')}
              value={rgbText.green}
              onChangeText={(green) => setRgbText((previous) => ({ ...previous, green }))}
              inputStyle={inputStyle}
            />
            <RgbChannelInput
              label={t('mobile.more.accessibility.channels.blue')}
              value={rgbText.blue}
              onChangeText={(blue) => setRgbText((previous) => ({ ...previous, blue }))}
              inputStyle={inputStyle}
            />
          </View>
        ) : (
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.defaultCopy}>
            {t('mobile.more.accessibility.defaultCopy')}
          </Text>
        )}

        {showValidationError ? (
          <Text variant="footnote" color={systemColors.accent}>
            {t('mobile.more.accessibility.invalidRgb')}
          </Text>
        ) : null}
      </View>
    </ModalSheet>
  );
}

function RgbChannelInput({
  label,
  value,
  onChangeText,
  inputStyle,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  inputStyle: StyleProp<TextStyle>;
}) {
  const { systemColors } = useTheme();
  return (
    <View style={styles.channelColumn}>
      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.channelLabel}>
        {label}
      </Text>
      <BottomSheetTextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={3}
        selectTextOnFocus
        returnKeyType="done"
        style={inputStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing[2],
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  description: {
    lineHeight: 18,
  },
  resetButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[1],
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerBody: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[4],
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  pickerTitleColumn: {
    flex: 1,
    gap: spacing[1],
  },
  rgbGrid: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  channelColumn: {
    flex: 1,
    gap: spacing[1],
  },
  channelLabel: {
    textAlign: 'center',
  },
  channelInput: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  defaultCopy: {
    lineHeight: 18,
  },
});
