import { type SharedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { CollapsingTopChrome } from './CollapsingTopChrome';

type DiscoverTopChromeProps = {
  /** Gate the create + (an authed user with a board can build a playlist). */
  canCreate: boolean;
  /** Build a playlist (Discover's defining action — no separate FAB). */
  onCreate: () => void;
  /** Open the full board switcher; the pill doubles as the board filter. */
  onOpenBoardSwitcher: () => void;
  /** Report the measured chrome height so the list can inset its top padding. */
  onHeightChange: (height: number) => void;
  /** List scroll offset, driving the "Discover" title collapse. */
  scrollY: SharedValue<number>;
  /** Tapping the collapsed "Discover" capsule scrolls the list back to the top. */
  onPressTitle: () => void;
};

/**
 * Discover's floating glass chrome. A thin wrapper over the shared
 * `CollapsingTopChrome` that injects the "Discover" title and the playlist /
 * boards i18n strings — the centred-title collapse and board-pill-to-toolbar
 * dock all live in the shared component, also used by the Climbs/Search tab.
 */
export function DiscoverTopChrome(props: DiscoverTopChromeProps) {
  const { t } = useTranslation('playlists');
  const { t: tBoards } = useTranslation('boards');
  return (
    <CollapsingTopChrome
      {...props}
      title={t('bottomTabBar.discover')}
      createAccessibilityLabel={t('library.createFab.ariaLabel')}
      boardPillAccessibilityHint={tBoards('boardPill.switchHint')}
    />
  );
}
