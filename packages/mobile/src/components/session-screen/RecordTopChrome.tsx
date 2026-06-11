import { useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Appbar } from 'react-native-paper';
import { CollapsingTopChrome, GlassToolbarAction } from '../chrome';
import { Icon } from '../Icon';
import { iconMap } from '../icon-map';
import { useTheme } from '../../providers/theme-provider';

// Record's defining action is the Start/End footer button, so the chrome's
// create island is gated off — its handler is never invoked.
const noop = () => {};

type RecordTopChromeProps = {
  /** The session title — the large in-body title and the collapsed capsule. */
  title: string;
  /** Open the full board switcher; the board pill doubles as the board picker. */
  onOpenBoardSwitcher: () => void;
  /** Report the measured chrome height so the list can inset its top padding. */
  onHeightChange: (height: number) => void;
  /** List scroll offset, driving the title collapse. */
  scrollY: SharedValue<number>;
  /** Tapping the collapsed title capsule scrolls the list back to the top. */
  onPressTitle: () => void;
  /** Open the invite sheet. Provided only while a session is live; the share
   *  glyph then docks at the far right of the chrome's right toolbar. */
  onShare?: () => void;
  /** Open the End-session confirmation. Provided only while a session is live; the
   *  End glyph docks beside the share control (destructive tint) so the session's
   *  stop lives in the nav-bar trailing slot, off the bottom edge. */
  onEndSession?: () => void;
};

/**
 * The Record tab's top chrome, routed by UI variant.
 *
 * Liquid Glass: a thin wrapper over the shared `CollapsingTopChrome` (mirroring
 * `DiscoverTopChrome`) that injects the session title plus the board / invite
 * i18n strings. Record's primary action is the Start/End footer button, so
 * there's no create "+"; instead, while a session is live it docks a
 * share/invite control as the chrome's `trailingAction`. The board pill, angle,
 * and light islands come for free from `CollapsingTopChrome`.
 *
 * Material: an absolutely-positioned, `onHeightChange`-measured M3 small app bar
 * (mirroring `ClimbTopChrome`) — the session title via `Appbar.Content` and (only
 * while a session is live) a share `Appbar.Action`. The board is switched from the
 * in-body `BoardSummaryCard` (which carries the full name · size · angle), so the
 * app bar stays session-titled rather than duplicating a board switcher. There's
 * no collapse on Material, so `scrollY` / `onPressTitle` are unused.
 */
export function RecordTopChrome({
  title,
  onOpenBoardSwitcher,
  onHeightChange,
  scrollY,
  onPressTitle,
  onShare,
  onEndSession,
}: RecordTopChromeProps) {
  const { t } = useTranslation('session');
  const { t: tBoards } = useTranslation('boards');
  const { brandColors, systemColors, variant } = useTheme();
  const insets = useSafeAreaInsets();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );

  if (variant === 'material') {
    return (
      <View
        pointerEvents="box-none"
        style={[
          styles.materialContainer,
          {
            paddingTop: insets.top,
            backgroundColor: systemColors.secondaryBackground,
            borderBottomColor: systemColors.separator,
          },
        ]}
        onLayout={handleLayout}
      >
        <Appbar.Header
          statusBarHeight={0}
          mode="small"
          elevated
          style={[styles.materialAppbar, { backgroundColor: systemColors.secondaryBackground }]}
        >
          <Appbar.Content title={title} color={systemColors.label as string} />
          {onShare ? (
            <Appbar.Action
              icon={iconMap['person.badge.plus'].android}
              color={systemColors.label as string}
              onPress={onShare}
              accessibilityLabel={t('mobile.session.invite')}
            />
          ) : null}
          {onEndSession ? (
            <Appbar.Action
              icon={iconMap['flag'].android}
              color={brandColors.error}
              onPress={onEndSession}
              accessibilityLabel={t('mobile.session.inEndSession')}
            />
          ) : null}
        </Appbar.Header>
      </View>
    );
  }

  // Liquid-glass variant: the shared collapsing chrome with the session title,
  // board pill, and (while live) the share/invite + End trailing actions. End sits
  // up here (destructive tint) rather than as a bottom bar, so the bottom edge keeps
  // at most the tab bar + climb accessory.
  const trailingAction =
    onShare || onEndSession ? (
      <>
        {onShare ? (
          <GlassToolbarAction onPress={onShare} accessibilityLabel={t('mobile.session.invite')}>
            <Icon name="person.badge.plus" size={22} color={brandColors.primary} />
          </GlassToolbarAction>
        ) : null}
        {onEndSession ? (
          <GlassToolbarAction onPress={onEndSession} accessibilityLabel={t('mobile.session.inEndSession')}>
            <Icon name="flag" size={22} color={brandColors.error} />
          </GlassToolbarAction>
        ) : null}
      </>
    ) : undefined;
  const trailingActionCount = (onShare ? 1 : 0) + (onEndSession ? 1 : 0);

  return (
    <CollapsingTopChrome
      title={title}
      // Record has no create action — the create island is gated off (canCreate
      // false), so onCreate / createAccessibilityLabel are inert.
      canCreate={false}
      onCreate={noop}
      createAccessibilityLabel={title}
      onOpenBoardSwitcher={onOpenBoardSwitcher}
      boardPillAccessibilityHint={tBoards('boardPill.switchHint')}
      onHeightChange={onHeightChange}
      scrollY={scrollY}
      onPressTitle={onPressTitle}
      trailingAction={trailingAction}
      trailingActionCount={trailingActionCount}
    />
  );
}

const styles = StyleSheet.create({
  materialContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  materialAppbar: {
    elevation: 0,
    shadowOpacity: 0,
  },
});
