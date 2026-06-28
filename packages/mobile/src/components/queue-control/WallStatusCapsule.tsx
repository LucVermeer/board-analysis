// The "On the wall" status capsule — a compact pill that surfaces the climb
// currently LIT on the physical board (when it differs from the user's own queue
// head, e.g. a teammate is driving the wall in a party session). It sits in the
// centre of the top-header islands row (iOS) / a slim row under the app bar
// (Android) — the home for "what's lit right now" that the bottom queue accessory
// used to overload.
//
// Leads with the SENDER's avatar (whoever sent the climb to the board), so the
// capsule answers "who lit it + what's lit" at a glance — the core party-session
// signal a lightbulb never carried. The avatar is INERT here (one Pressable opens
// the read-only wall preview; the tap-sender-to-profile affordance lives in that
// preview sheet, which has room for a full target). Fully-anonymous senders fall
// back to an amber person glyph — never a lightbulb (a bistable leading slot
// breaks the visual scan + VoiceOver grammar) and never a literal "?".
//
// Deliberately a NON-glass pill (HIG: no glass-on-glass over the header's
// progressive blur) with a warm "lit" tint — now the sole at-a-glance "live"
// carrier. Compact by design — the name truncates, the grade stays.

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { spacing } from '../../theme/tokens';
import { withAlpha } from '../../theme/colors';
import { CHROME_LABEL_MAX_FONT_SCALE } from '../../theme/typography';
import { boardPresenceClimbToClimb } from '../../lib/board-presence/presence-climb';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { BoardDriverAvatar } from '../board-presence/BoardDriverAvatar';
import { useOpenWallPreview } from './use-open-wall-preview';

const CAPSULE_HEIGHT = 32;
// 20pt reads unambiguously as a face above M3's ~18dp floor while protecting the
// truncating climb name in the tight centre slot (M3 would prefer 24; default to
// 20). Fixed — does not scale with Dynamic Type.
const AVATAR_SIZE = 20;
// Debounce assistive-tech announcements so a fast party session (rapid wall
// changes) doesn't spam the speech queue.
const ANNOUNCE_DEBOUNCE_MS = 600;

type WallStatusCapsuleProps = {
  /** The wall's lit climb (already resolved as distinct from the queue head). */
  climb: BoardPresenceClimb;
};

// memo'd so a ClimbTopChrome re-render (filter/board/search change) doesn't rebuild
// the capsule's hooks while the wall climb is unchanged — the `climb` prop is the
// stable BoardPresenceClimb from useWallClimbIfDistinct (changes only on a wall event).
function WallStatusCapsuleImpl({ climb }: WallStatusCapsuleProps) {
  const { t } = useTranslation('session');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const reduceMotion = useReducedMotion();
  const openWallPreview = useOpenWallPreview();

  const name = climb.name ?? '';
  const formattedGrade = formatGrade(climb.grade ?? '');
  const gradeColor = getGradeColor(climb.grade ?? '') ?? DEFAULT_GRADE_COLOR;
  const senderName = climb.sentByDisplayName?.trim() || null;
  const hasSenderIdentity = climb.sentByAvatarUrl != null || senderName != null;

  const a11yLabel = senderName
    ? t('mobile.boardPresence.stripA11yLabelWithSender', { name, grade: formattedGrade ?? '', sender: senderName })
    : t('mobile.boardPresence.stripA11yLabel', { name, grade: formattedGrade ?? '' });

  // Announce peer-driven changes the user didn't initiate (debounced + de-duped on
  // the climb's uuid so a re-render doesn't re-announce the same climb). Done
  // explicitly rather than via accessibilityLiveRegion, because the capsule remounts
  // on each climb change (keyed Animated.View) — a fresh node has no "content
  // change" for a live region to catch.
  const announceLabel = senderName
    ? t('mobile.boardPresence.stripAnnounceWithSender', { name, grade: formattedGrade ?? '', sender: senderName })
    : t('mobile.boardPresence.stripAnnounce', { name, grade: formattedGrade ?? '' });
  const climbUuid = climb.climbUuid;
  // De-dupe on the announced TEXT, not the uuid: a re-render with an unchanged label
  // shouldn't re-announce, but a locale switch (same climb, new label) should.
  const lastAnnouncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAnnouncedRef.current === announceLabel) return;
    const handle = setTimeout(() => {
      lastAnnouncedRef.current = announceLabel;
      AccessibilityInfo.announceForAccessibility(announceLabel);
    }, ANNOUNCE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [announceLabel]);

  const tintStyle = useMemo(
    () => [StyleSheet.absoluteFill, { backgroundColor: withAlpha(brandColors.warning, 0.14) }],
    [brandColors.warning],
  );

  const handlePress = useCallback(() => openWallPreview(boardPresenceClimbToClimb(climb)), [openWallPreview, climb]);

  return (
    <Animated.View
      // Fades IN on mount and on each wall-climb change (keyed remount). Removal is
      // an instant cut — Reanimated can't reliably intercept an `exiting` whose
      // wrapping parent unmounts in the same commit (the Material under-app-bar row),
      // so we don't promise a fade-out the layout can't deliver.
      key={climbUuid}
      entering={reduceMotion ? undefined : FadeIn.duration(180)}
      style={[
        styles.capsule,
        { backgroundColor: systemColors.secondaryBackground, borderColor: withAlpha(brandColors.warning, 0.35) },
      ]}
    >
      <View pointerEvents="none" style={tintStyle} />
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('mobile.boardPresence.stripA11yHint')}
        style={styles.pressable}
      >
        {/* The sender, leading. Inert + a11y-hidden so the pill reads as one node
            (the profile tap lives in the wall-preview sheet). `userId={null}` is
            deliberate — it only suppresses the avatar's own profile-link tap; the
            face still resolves from `sentByAvatarUrl` (Avatar renders the image off
            `uri`, not `userId`), so this never degrades a known sender's photo. A
            sender with only a userId (no photo, no display name) has nothing
            renderable as a face/monogram, so it correctly takes the person glyph. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {hasSenderIdentity ? (
            <BoardDriverAvatar
              uri={climb.sentByAvatarUrl}
              name={senderName}
              userId={null}
              size={AVATAR_SIZE}
              status="none"
            />
          ) : (
            <Icon name="profile.fill" size={18} color={brandColors.warning} />
          )}
        </View>
        <Text
          variant="footnote"
          color={systemColors.label}
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={CHROME_LABEL_MAX_FONT_SCALE}
          style={styles.name}
        >
          {name}
        </Text>
        {formattedGrade ? (
          <Text
            variant="footnote"
            numberOfLines={1}
            maxFontSizeMultiplier={CHROME_LABEL_MAX_FONT_SCALE}
            style={[styles.grade, { color: gradeColor }]}
          >
            {formattedGrade}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export const WallStatusCapsule = memo(WallStatusCapsuleImpl);

const styles = StyleSheet.create({
  capsule: {
    flexShrink: 1,
    maxWidth: '100%',
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pressable: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingLeft: spacing[1],
    paddingRight: spacing[3],
    gap: spacing[2],
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
    fontWeight: '600',
  },
  grade: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
});
