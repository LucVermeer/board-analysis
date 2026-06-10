import { type SharedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { CollapsingTopChrome, GlassToolbarAction } from '../chrome';
import { Icon } from '../Icon';
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
};

/**
 * The Record tab's floating glass chrome. A thin wrapper over the shared
 * `CollapsingTopChrome` (mirroring `DiscoverTopChrome`) that injects the session
 * title plus the board / invite i18n strings. Record's primary action is the
 * Start/End footer button, so there's no create "+"; instead, while a session is
 * live it docks a share/invite control as the chrome's `trailingAction`. The
 * board pill, angle, and light islands come for free from `CollapsingTopChrome`.
 */
export function RecordTopChrome({
  title,
  onOpenBoardSwitcher,
  onHeightChange,
  scrollY,
  onPressTitle,
  onShare,
}: RecordTopChromeProps) {
  const { t } = useTranslation('session');
  const { t: tBoards } = useTranslation('boards');
  const { brandColors } = useTheme();

  const trailingAction = onShare ? (
    <GlassToolbarAction onPress={onShare} accessibilityLabel={t('mobile.session.invite')}>
      <Icon name="person.badge.plus" size={22} color={brandColors.primary} />
    </GlassToolbarAction>
  ) : undefined;

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
    />
  );
}
