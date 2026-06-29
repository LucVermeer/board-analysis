import * as Clipboard from 'expo-clipboard';
import { SHARED_EVENTS, type AnalyticsEventProperties } from '@boardsesh/analytics';

export type CopyClimbNameTarget = { name?: string | null; uuid: string };

export type CopyClimbNameDeps = {
  /** Tactile confirmation of the long-press. */
  haptic: () => void;
  /** Analytics sink (forwards a ClimbShared event with method=copy_name). Matches
   *  the `track` signature from @boardsesh/analytics. */
  track: (event: string, properties?: AnalyticsEventProperties) => void;
  /** Shows the "Name copied" confirmation. */
  showToast: (message: string) => void;
  /** Already-localized toast string. */
  toastMessage: string;
};

/**
 * Copy a climb's name to the clipboard with haptic + toast confirmation and a
 * share-analytics event. Pure orchestration with all platform I/O injected (bar
 * the clipboard, which is mocked at the module boundary in tests) so the
 * behaviour is unit-testable without mounting the play drawer.
 *
 * Returns `false` (no-op) when there's no name to copy.
 */
export function copyClimbName(
  climb: CopyClimbNameTarget | null | undefined,
  context: { boardName: string; layoutId: number },
  deps: CopyClimbNameDeps,
): boolean {
  const name = climb?.name;
  if (!name) return false;
  void Clipboard.setStringAsync(name);
  deps.haptic();
  deps.track(SHARED_EVENTS.ClimbShared, {
    method: 'copy_name',
    climbUuid: climb.uuid,
    boardName: context.boardName,
    layoutId: context.layoutId,
  });
  deps.showToast(deps.toastMessage);
  return true;
}
