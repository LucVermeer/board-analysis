import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
  createInitialTickState,
  deriveAscentType,
  getMinAttempts,
  clampAttempts,
  type TickStatus,
} from '@boardsesh/play-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { GlassSurface } from '../GlassSurface';
import { InlineStarPicker } from './InlineStarPicker';
import { InlineGradePicker } from './InlineGradePicker';
import { InlineTriesPicker } from './InlineTriesPicker';
import { useTheme } from '../../providers/theme-provider';
import { useGrades } from '../../lib/graphql/hooks';
import { useSaveTick } from '@boardsesh/board-react';
import { toBoardName } from '@boardsesh/board-config';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { timing } from '../../theme/animations';

type QuickTickBarProps = {
  visible: boolean;
  climbUuid: string;
  boardName: string;
  angle: number;
  isMirror: boolean;
  isBenchmark: boolean;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  sessionId?: string | null;
  // The climb's consensus grade label (e.g. "V5", "7a+"). Mapped to a
  // numeric difficulty id at render time via the loaded grades list and
  // forwarded to InlineGradePicker so the consensus chip is centered (and
  // visually outlined) without being preselected. This is just the
  // existing Climb.difficulty string — getClimbByUuid already produces it
  // from ROUND(display_difficulty), so no new GraphQL field is needed.
  consensusGradeName?: string;
  // True when the user has previously logged an ascent or attempt on this
  // climb. Drives `deriveAscentType` so the primary save button reads
  // "Send" (not "Flash") on the first attempt of a re-attempt — a flash
  // requires no prior history at all.
  hasPriorHistory?: boolean;
  // When true, render contents in a passive View instead of the
  // absolute-positioned animated bar. Use this when a parent (e.g. a
  // BottomSheet) already owns positioning and slide-in animation. The
  // `visible` prop still drives mount/unmount so child state resets work
  // identically across the two modes.
  embedded?: boolean;
  onDismiss: () => void;
};

export const QuickTickBar = React.memo(function QuickTickBar({
  visible,
  climbUuid,
  boardName,
  angle,
  isMirror,
  isBenchmark,
  layoutId,
  sizeId,
  setIds,
  sessionId,
  consensusGradeName,
  hasPriorHistory = false,
  embedded = false,
  onDismiss,
}: QuickTickBarProps) {
  const { t } = useTranslation('session');
  const { t: tClimbs } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const saveTick = useSaveTick(toBoardName(boardName));
  const { data: grades } = useGrades(boardName);

  const [tickState, setTickState] = useState(createInitialTickState);
  const [comment, setComment] = useState('');
  const [mounted, setMounted] = useState(visible);

  // Resolve the consensus grade *name* (e.g. "V5") to a numeric difficulty
  // id by matching against the loaded grades list. The id is what
  // InlineGradePicker compares against each chip's `difficultyId`.
  const consensusDifficultyId = useMemo(() => {
    if (!consensusGradeName || !grades) return undefined;
    return grades.find((grade) => grade.name === consensusGradeName)?.difficultyId;
  }, [consensusGradeName, grades]);

  const ascentType = deriveAscentType(hasPriorHistory, tickState.attemptCount);
  const minAttempts = useMemo(() => getMinAttempts(ascentType), [ascentType]);

  useEffect(() => {
    setTickState(createInitialTickState());
    setComment('');
  }, [climbUuid]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  const translateY = useSharedValue(200);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: timing.normal });
    } else {
      translateY.value = withTiming(200, { duration: timing.fast }, () => {
        runOnJS(setMounted)(false);
      });
    }
  }, [visible, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: translateY.value < 100 ? 1 : 0,
  }));

  const handleQualitySelect = useCallback((value: number | null) => {
    setTickState((prev) => ({ ...prev, quality: value }));
  }, []);

  const handleGradeSelect = useCallback((difficultyId: number | undefined) => {
    setTickState((prev) => ({ ...prev, difficulty: difficultyId }));
  }, []);

  const handleTriesSelect = useCallback((value: number) => {
    setTickState((prev) => ({ ...prev, attemptCount: value }));
  }, []);

  const handleSaveWithStatus = useCallback(
    (status: TickStatus) => {
      if (saveTick.isPending) return;

      const finalAttempts = clampAttempts(tickState.attemptCount, status);

      saveTick.mutate(
        {
          climbUuid,
          angle,
          isMirror,
          status,
          attemptCount: finalAttempts,
          quality: tickState.quality != null && tickState.quality > 0 ? tickState.quality : null,
          difficulty: tickState.difficulty ?? null,
          isBenchmark,
          comment,
          climbedAt: new Date().toISOString(),
          ...(sessionId ? { sessionId } : {}),
          ...(layoutId != null ? { layoutId } : {}),
          ...(sizeId != null ? { sizeId } : {}),
          ...(setIds ? { setIds } : {}),
        },
        {
          onSuccess: () => {
            hapticSuccess();
            onDismiss();
          },
          onError: () => {
            hapticError();
          },
        },
      );
    },
    [
      saveTick,
      climbUuid,
      angle,
      isMirror,
      isBenchmark,
      sessionId,
      layoutId,
      sizeId,
      setIds,
      tickState,
      comment,
      onDismiss,
    ],
  );

  const handleSave = useCallback(() => handleSaveWithStatus(ascentType), [handleSaveWithStatus, ascentType]);
  const handleAttempt = useCallback(() => handleSaveWithStatus('attempt'), [handleSaveWithStatus]);

  if (!embedded && !mounted) return null;
  if (embedded && !visible) return null;

  const saveLabel = ascentType === 'flash' ? t('playView.tickBar.flashSaveLabel') : t('playView.tickBar.sendSaveLabel');

  // Shared between the inline (Animated.View + GlassSurface) and embedded
  // (plain View inside a BottomSheet) branches — the only thing those two
  // differ on is the outer container chrome.
  const tickBarContents = (
    <>
      <View style={styles.row}>
        <Text variant="footnote" color={iosSystemColors.systemGray} style={styles.rowLabel}>
          {t('playView.tickBar.gradeLabel')}
        </Text>
        <View style={styles.rowPicker}>
          {grades && (
            <InlineGradePicker
              grades={grades}
              selectedDifficultyId={tickState.difficulty}
              consensusDifficultyId={consensusDifficultyId}
              onSelect={handleGradeSelect}
            />
          )}
        </View>
      </View>

      <View style={styles.row}>
        <Text variant="footnote" color={iosSystemColors.systemGray} style={styles.rowLabel}>
          {t('playView.tickBar.triesLabel')}
        </Text>
        <View style={styles.rowPicker}>
          <InlineTriesPicker
            attemptCount={tickState.attemptCount}
            minAttempts={minAttempts}
            onSelect={handleTriesSelect}
          />
        </View>
      </View>

      <View style={styles.row}>
        <Text variant="footnote" color={iosSystemColors.systemGray} style={styles.rowLabel}>
          {t('playView.tickBar.starsLabel')}
        </Text>
        <View style={styles.rowPicker}>
          <InlineStarPicker quality={tickState.quality} onSelect={handleQualitySelect} />
        </View>
      </View>

      <View style={styles.commentRow}>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('playView.tickBar.commentPlaceholder')}
          placeholderTextColor={systemColors.tertiaryLabel as string}
          accessibilityLabel={t('playView.tickBar.commentAria')}
          multiline
          style={
            {
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: systemColors.separator as string,
              borderRadius: 10,
              paddingHorizontal: spacing[3],
              paddingVertical: spacing[2],
              fontSize: 14,
              lineHeight: 19,
              color: systemColors.label as string,
              minHeight: 56,
              textAlignVertical: 'top',
            } satisfies TextStyle
          }
        />
      </View>

      <View style={styles.saveRow}>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('playView.tickBar.cancelLabel')}
          style={styles.cancelButton}
        >
          <Text variant="footnote" color={iosSystemColors.systemGray}>
            {t('playView.tickBar.cancelLabel')}
          </Text>
        </Pressable>

        <View style={styles.saveRowActions}>
          <Pressable
            onPress={handleAttempt}
            disabled={saveTick.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('playView.tickBar.logAscentAria', { status: 'attempt' })}
            style={({ pressed }) => [
              styles.attemptButton,
              pressed && styles.saveButtonPressed,
              saveTick.isPending && styles.saveButtonDisabled,
            ]}
          >
            <Icon name="tick.outline" size={18} color={iosSystemColors.white} />
            <Text variant="footnote" color={iosSystemColors.white} style={styles.saveLabel}>
              {tClimbs('mobile.logAscent.attempt')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saveTick.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('playView.tickBar.logAscentAria', { status: ascentType })}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              saveTick.isPending && styles.saveButtonDisabled,
            ]}
          >
            <Icon name="tick.outline" size={18} color={iosSystemColors.white} />
            <Text variant="footnote" color={iosSystemColors.white} style={styles.saveLabel}>
              {saveLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedContainer}>{tickBarContents}</View>;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        // Solid safety-net background so the bar is always legible even on
        // dev clients where the glass/blur native module isn't linked, or on
        // platforms where GlassSurface degrades. Glass effect, when present,
        // composites over this opaque base.
        { backgroundColor: systemColors.secondaryBackground, borderTopColor: systemColors.separator },
        animatedStyle,
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <GlassSurface glassEffectStyle="regular" style={StyleSheet.absoluteFill} pointerEvents="none" />
      {tickBarContents}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    // Clip the glass / blur material to the rounded top edge.
    overflow: 'hidden',
    zIndex: 5,
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  // Sibling of `container` for the `embedded` mode: drops absolute
  // positioning, slide-in animation, and chrome (rounded corners + top
  // border) since the host BottomSheet owns all of that.
  embeddedContainer: {
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    minHeight: 44,
  },
  rowLabel: {
    width: 48,
    fontWeight: '500',
  },
  rowPicker: {
    flex: 1,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: iosSystemColors.separator,
    marginTop: spacing[2],
  },
  cancelButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: 20,
    backgroundColor: brandColors.success,
  },
  attemptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: 20,
    backgroundColor: iosSystemColors.systemRed,
  },
  saveRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  commentRow: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  saveButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveLabel: {
    fontWeight: '600',
  },
});
