import { memo, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { BleLightbulbButton } from '../ble/BleLightbulbButton';
import { ActionButton, SIZES, type ButtonSize, drawerActionBarStyles } from '../drawer-action-bar/DrawerActionBar';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { shadows } from '../../theme/tokens';
import { hapticMedium } from '../../lib/haptics';

type PlayDrawerActionBarProps = {
  canSwipePrevious: boolean;
  canSwipeNext: boolean;
  isMirrored: boolean;
  supportsMirroring: boolean;
  isFavorited: boolean;
  remainingQueueCount: number;
  lightbulbActive: boolean;
  lightbulbPending?: boolean;
  ascentCount: number;
  currentAngle?: number;
  onPrevClick: () => void;
  onNextClick: () => void;
  onMirror: () => void;
  onToggleFavorite: () => void;
  onLightbulb: () => void;
  onLightbulbLongPress?: () => void;
  onOpenActions: () => void;
  onOpenQueue: () => void;
  onShare: () => void;
  onTickPress: () => void;
  onTickLongPress: () => void;
  onOpenAngleSelector?: () => void;
};

export const PlayDrawerActionBar = memo(function PlayDrawerActionBar({
  canSwipePrevious,
  canSwipeNext,
  isMirrored,
  supportsMirroring,
  isFavorited,
  remainingQueueCount,
  lightbulbActive,
  lightbulbPending = false,
  ascentCount,
  currentAngle,
  onPrevClick,
  onNextClick,
  onMirror,
  onToggleFavorite,
  onLightbulb,
  onLightbulbLongPress,
  onOpenActions,
  onOpenQueue,
  onShare,
  onTickPress,
  onTickLongPress,
  onOpenAngleSelector,
}: PlayDrawerActionBarProps) {
  const { t } = useTranslation('session');
  const { t: tClimbs } = useTranslation('climbs');
  const { t: tSettings } = useTranslation('settings');

  const handlePrev = useCallback(() => {
    hapticMedium();
    onPrevClick();
  }, [onPrevClick]);

  const handleNext = useCallback(() => {
    hapticMedium();
    onNextClick();
  }, [onNextClick]);

  const handleMirror = useCallback(() => {
    hapticMedium();
    onMirror();
  }, [onMirror]);

  const handleFavorite = useCallback(() => {
    hapticMedium();
    onToggleFavorite();
  }, [onToggleFavorite]);

  const handleAngleSelector = useCallback(() => {
    hapticMedium();
    onOpenAngleSelector?.();
  }, [onOpenAngleSelector]);

  const handleShare = useCallback(() => {
    hapticMedium();
    onShare();
  }, [onShare]);

  return (
    <View style={drawerActionBarStyles.container}>
      <View style={drawerActionBarStyles.rowPrimary}>
        <View style={drawerActionBarStyles.primarySlot}>
          {supportsMirroring ? (
            <ActionButton
              size="lg"
              iconName="mirror"
              onPress={handleMirror}
              active={isMirrored}
              activeColor={brandColors.primary}
              accessibilityLabel={
                isMirrored ? t('playView.actionBar.unmirrorAria') : t('playView.actionBar.mirrorAria')
              }
            />
          ) : (
            // On boards without mirror support, the favorite (heart) takes the
            // first slot — keeps the row visually balanced and gives heart a
            // bigger tap target. It is removed from Row 2 below in that case.
            <ActionButton
              size="lg"
              iconName={isFavorited ? 'favorite.fill' : 'favorite'}
              onPress={handleFavorite}
              iconColor={isFavorited ? iosSystemColors.systemRed : undefined}
              accessibilityLabel={
                isFavorited ? t('playView.actionBar.removeFavoriteAria') : t('playView.actionBar.addFavoriteAria')
              }
            />
          )}
        </View>
        <View style={drawerActionBarStyles.primarySlot}>
          <ActionButton
            size="lg"
            iconName="skip.previous"
            onPress={handlePrev}
            disabled={!canSwipePrevious}
            accessibilityLabel={t('playView.actionBar.previousAria')}
          />
        </View>
        <View style={drawerActionBarStyles.primarySlot}>
          <TickButton
            size="lg"
            ascentCount={ascentCount}
            onPress={onTickPress}
            onLongPress={onTickLongPress}
            accessibilityLabel={t('playView.tickFab.logAscentAria')}
          />
        </View>
        <View style={drawerActionBarStyles.primarySlot}>
          <ActionButton
            size="lg"
            iconName="skip.next"
            onPress={handleNext}
            disabled={!canSwipeNext}
            accessibilityLabel={t('playView.actionBar.nextAria')}
          />
        </View>
        <View style={drawerActionBarStyles.primarySlot}>
          <BleLightbulbButton
            isConnected={lightbulbActive}
            isScanning={lightbulbPending}
            onPress={onLightbulb}
            onLongPress={lightbulbActive ? onLightbulbLongPress : undefined}
            accessibilityLabel={lightbulbActive ? tSettings('ble.relightBoard') : tSettings('ble.connectBoard')}
            scanningAccessibilityHint={tSettings('ble.scanning')}
            longPressAccessibilityHint={lightbulbActive ? tSettings('ble.holdForControls') : undefined}
            haptic="medium"
            size={SIZES.lg.icon}
            containerSize={SIZES.lg.dim}
          />
        </View>
      </View>

      <View style={drawerActionBarStyles.rowSecondary}>
        {onOpenAngleSelector && currentAngle != null && (
          <Pressable
            onPress={handleAngleSelector}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.angleSelector.title')}
            style={({ pressed }) => [
              styles.anglePill,
              { height: SIZES.sm.dim, borderRadius: SIZES.sm.dim / 2 },
              pressed && drawerActionBarStyles.actionButtonPressed,
            ]}
          >
            <Text variant="caption1" style={styles.angleText}>
              {currentAngle}°
            </Text>
          </Pressable>
        )}
        {supportsMirroring && (
          <ActionButton
            size="sm"
            iconName={isFavorited ? 'favorite.fill' : 'favorite'}
            onPress={handleFavorite}
            iconColor={isFavorited ? iosSystemColors.systemRed : undefined}
            accessibilityLabel={
              isFavorited ? t('playView.actionBar.removeFavoriteAria') : t('playView.actionBar.addFavoriteAria')
            }
          />
        )}
        <ActionButton
          size="sm"
          iconName="more"
          onPress={onOpenActions}
          accessibilityLabel={t('playView.actionBar.climbActionsAria')}
        />

        <View style={drawerActionBarStyles.spacer} />

        <ShareButton size="sm" onPress={handleShare} accessibilityLabel={tClimbs('mobile.climbRow.share')} />
        <ActionButton
          size="sm"
          iconName="queue"
          onPress={onOpenQueue}
          accessibilityLabel={t('playView.actionBar.queueCountAria', { count: remainingQueueCount })}
        />
      </View>
    </View>
  );
});

type ShareButtonProps = {
  size: ButtonSize;
  onPress: () => void;
  accessibilityLabel: string;
};

// The share glyph resolves to the native iOS share symbol (square.and.arrow.up) on
// iOS and the Material Design share icon on Android — Icon picks per platform from
// the shared icon-map.
function ShareButton({ size, onPress, accessibilityLabel }: ShareButtonProps) {
  const { dim, icon } = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        drawerActionBarStyles.actionButton,
        { width: dim, height: dim, borderRadius: dim / 2 },
        pressed && drawerActionBarStyles.actionButtonPressed,
      ]}
    >
      <Icon name="share" size={icon} color={iosSystemColors.systemGray} />
    </Pressable>
  );
}

type TickButtonProps = {
  size: ButtonSize;
  ascentCount: number;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
};

function TickButton({ size, ascentCount, onPress, onLongPress, accessibilityLabel }: TickButtonProps) {
  const { dim, icon } = SIZES[size];
  const handlePress = useCallback(() => {
    hapticMedium();
    onPress();
  }, [onPress]);
  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    hapticMedium();
    onLongPress();
  }, [onLongPress]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.tickButton,
        { width: dim, height: dim, borderRadius: dim / 2 },
        pressed && styles.tickButtonPressed,
      ]}
    >
      <Icon name="tick.outline" size={icon} color={iosSystemColors.white} />
      {ascentCount > 0 && (
        <View style={styles.countBadge}>
          <Text variant="caption2" color={iosSystemColors.white} style={styles.countText}>
            {ascentCount > 99 ? '99' : String(ascentCount)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anglePill: {
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${iosSystemColors.systemGray}1F`,
  },
  angleText: {
    fontWeight: '600',
    color: iosSystemColors.systemGray,
  },
  tickButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.success,
    ...shadows.md,
  },
  tickButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.92 }],
  },
  countBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: brandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
});
