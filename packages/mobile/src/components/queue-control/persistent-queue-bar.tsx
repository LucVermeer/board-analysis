/**
 * PersistentQueueBar — the floating climb toolbar that mounts at the app root
 * and is visible on every screen while a current climb is set.
 *
 * It is a thin adapter: it decides *whether* the climb bar should show (a current
 * climb exists and the native iOS 26 bottom accessory isn't already owning it),
 * then hands the climb capsule + log-ascent tick to the content-agnostic
 * {@link ActiveContextBar} for layout:
 *
 *   [ grade · climb name ]            [ ✓ tick ]
 *     ↑ tap = PlayDrawer                ↑ log ascent — shown on every tab so the
 *       swipe = prev/next                 fallback matches the always-on iOS 26
 *                                         bottom accessory (current climb + tick)
 *
 * On the Liquid Glass variant on iOS 26 the native bottom accessory owns this
 * same pair, so `jsQueueToolbarVisible` is false here and this returns null.
 */

import { TOOLBAR_RESERVE, TAB_BAR_HEIGHT } from '../../theme/layout';
import { useQueue } from '../../providers/queue-provider';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { ActiveContextBar } from './ActiveContextBar';
import { ClimbCapsule } from './ClimbCapsule';
import { LogAscentFab } from './LogAscentFab';

// Re-export so layout consumers that already import toolbar metrics from this
// module don't need to know which file owns them. Source of truth: theme/layout.
export { TOOLBAR_RESERVE, TAB_BAR_HEIGHT };

export function PersistentQueueBar() {
  const { state } = useQueue();
  const bottomChrome = useBottomChromeMetrics();

  const currentClimb = state.currentClimbQueueItem?.climb;

  if (!bottomChrome.jsQueueToolbarVisible) return null;
  if (!currentClimb) return null;

  return <ActiveContextBar primary={<ClimbCapsule />} trailing={<LogAscentFab climb={currentClimb} />} />;
}
