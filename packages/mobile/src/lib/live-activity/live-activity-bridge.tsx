import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueue } from '../../providers/queue-provider';
import { useLiveActivity } from './use-live-activity';
import { addWidgetQueueNavigateListener } from './live-activity-plugin';

type LiveActivityBridgeProps = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
};

// Renderless component that mounts useLiveActivity() with the active
// queue + board context, and wires the native `queueNavigate` event
// (fired when the user taps Next/Previous on the Dynamic Island) into
// the queue reducer so the app's currentClimbQueueItem stays in sync
// with the widget.
//
// Mount inside BluetoothProviderWrapper (i.e. only when a board has been
// selected) so a guest user without a board doesn't trigger Live Activity
// authorization prompts at random.
export function LiveActivityBridge({ boardName, layoutId, sizeId, setIds }: LiveActivityBridgeProps) {
  const { state, sessionId, nextClimb, previousClimb } = useQueue();
  const { t } = useTranslation('session');

  // Localized strings for the Android foreground-service notification (channel +
  // Previous/Next actions). Built here because hooks need a component context;
  // ignored on iOS, where ActivityKit renders its own Swift UI.
  const androidNotification = useMemo(
    () => ({
      channelName: t('mobile.session.notification.channelName'),
      channelDescription: t('mobile.session.notification.channelDescription'),
      contentTitleFallback: t('mobile.session.notification.contentTitleFallback'),
      previousLabel: t('mobile.session.notification.previous'),
      nextLabel: t('mobile.session.notification.next'),
    }),
    [t],
  );

  useLiveActivity({
    queue: state.queue,
    currentClimbQueueItem: state.currentClimbQueueItem,
    board: { boardName, layoutId, sizeId, setIds },
    sessionId,
    isSessionActive: state.queue.length > 0 || state.currentClimbQueueItem !== null,
    androidNotification,
  });

  // Subscribe to widget Next/Previous taps. Native already updates the
  // optimistic Live Activity state and persists the new index to App Group
  // UserDefaults; this listener brings the JS-side reducer in line so that
  // when the app foregrounds, its currentClimbQueueItem matches the wall.
  useEffect(() => {
    const unsubscribe = addWidgetQueueNavigateListener((event) => {
      if (event.action === 'next') {
        nextClimb();
      } else if (event.action === 'previous') {
        previousClimb();
      }
    });
    return unsubscribe;
  }, [nextClimb, previousClimb]);

  return null;
}
