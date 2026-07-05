import { useKeepAwakeWhile } from '../../hooks/use-keep-awake-while';

const WAKE_LOCK_TAG = 'play-drawer';

export function usePlayDrawerWakeLock(isOpen: boolean): void {
  useKeepAwakeWhile(isOpen, WAKE_LOCK_TAG);
}
