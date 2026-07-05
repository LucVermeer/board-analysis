import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

// Keeps the screen awake while `active`, scoped to a named tag so multiple
// callers (play drawer, wall kiosk) hold independent locks — the screen stays
// awake while any tag is active. Releases on deactivate and on unmount.
export function useKeepAwakeWhile(active: boolean, tag: string): void {
  useEffect(() => {
    if (active) {
      activateKeepAwakeAsync(tag).catch(() => {});
    } else {
      deactivateKeepAwake(tag).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(tag).catch(() => {});
    };
  }, [active, tag]);
}
