import * as Clipboard from 'expo-clipboard';
import { SHARED_EVENTS, type AnalyticsEventProperties } from '@boardsesh/analytics';

export type CopyClimbNameTarget = { name?: string | null; uuid: string };

export type CopyClimbNameDeps = {
  /** Tactile confirmation of the long-press. */
  haptic: () => void;
  /** Analytics sink (forwards a ClimbShared event with method=copy_name). Matches
   *  the `track` signature from @boardsesh/analytics. */
  track: (event: string, properties?: AnalyticsEventProperties) => void;
  /** Shows a toast (info on success, error on a failed write). */
  showToast: (message: string, variant?: 'info' | 'error') => void;
  /** Already-localized success string. */
  toastMessage: string;
  /** Already-localized failure string, shown when the clipboard write rejects. */
  errorToastMessage: string;
};

/**
 * Copy a climb's name to the clipboard with haptic + toast confirmation and a
 * share-analytics event. Pure orchestration with all platform I/O injected (bar
 * the clipboard, which is mocked at the module boundary in tests) so the
 * behaviour is unit-testable without mounting the play drawer.
 *
 * Awaits the clipboard write so the "Name copied" confirmation never fires when
 * nothing actually landed on the clipboard. Resolves `false` when there's no
 * name to copy or the write fails.
 */
export async function copyClimbName(
  climb: CopyClimbNameTarget | null | undefined,
  context: { boardName: string; layoutId: number },
  deps: CopyClimbNameDeps,
): Promise<boolean> {
  const name = climb?.name;
  if (!name) return false;
  try {
    await Clipboard.setStringAsync(name);
  } catch {
    // Nothing reached the clipboard — surface a failure rather than a silent
    // no-op, so the long-press doesn't just feel broken.
    deps.showToast(deps.errorToastMessage, 'error');
    return false;
  }
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
