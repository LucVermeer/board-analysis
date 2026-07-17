// Pure orchestration for the crash-screen OTA recovery button ("Check for a fix").
// All platform I/O (expo-updates) is injected so the check/fetch/reload state
// machine can be unit-tested without a rendered component or native modules. The
// root ErrorBoundary (app/_layout.tsx) is a thin UI layer over this.
//
// The incident this exists for (2026-07-17): a broken production OTA crashed the
// app at the root ErrorBoundary, where "Try again" only re-renders the same
// broken in-memory bundle. Recovery required an invisible dance — dwell in the
// foreground so expo-updates background-downloads the fix, then force-quit and
// relaunch. This collapses that into one tap: check → fetch → reload, which also
// applies a published rollback-to-embedded directive and any already-downloaded
// pending update.

export type OtaRecoveryResult =
  // The server had a newer update for this build's fingerprint: fetched + reloaded.
  | 'reloaded-update'
  // The server published a rollback-to-embedded directive: fetched + reloaded onto
  // the binary's known-good embedded bundle.
  | 'reloaded-rollback'
  // Nothing new on the server, but an update was already downloaded (pending): reloaded
  // to launch it without re-fetching.
  | 'reloaded-pending'
  // Nothing new, nothing pending — did NOT reload, because reloading would just
  // relaunch the same broken bundle.
  | 'no-fix-available'
  // The check or fetch threw, or the whole check+fetch stalled past the timeout.
  | 'failed';

export type OtaRecoveryPhase = 'checking' | 'downloading';

export type OtaRecoveryDeps = {
  // Ask the OTA server whether a newer update (isAvailable) or a rollback directive
  // (isRollBackToEmbedded) is published for this build's fingerprint.
  checkForUpdate: () => Promise<{ isAvailable: boolean; isRollBackToEmbedded: boolean }>;
  // Download the update the check found (a newer bundle, or the rollback directive).
  fetchUpdate: () => Promise<unknown>;
  // Restart onto the downloaded/pending update. In production the app relaunches here.
  reload: () => Promise<void>;
  // Whether an update is already downloaded and staged to launch on the next reload.
  isUpdatePending: () => boolean;
  // Overall budget for the check+fetch network work before we give up (default 30s).
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

// A descriptor of what the check resolved to, so `reload()` stays OUTSIDE the
// timeout race (once we commit to reloading, the app restarts — there's nothing
// left to time out).
type RecoveryPlan = {
  shouldReload: boolean;
  result: OtaRecoveryResult;
};

// Race `work` against a timeout, clearing the timer whichever side wins so a
// resolved happy path never leaves a pending timer to reject unobserved.
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OTA recovery timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

// The network portion: check, then download when there's something to download.
// Returns the plan; the caller performs the reload afterward so it isn't raced
// against the timeout.
async function resolveRecoveryPlan(
  deps: OtaRecoveryDeps,
  onPhase?: (phase: OtaRecoveryPhase) => void,
): Promise<RecoveryPlan> {
  onPhase?.('checking');
  const check = await deps.checkForUpdate();

  if (check.isAvailable || check.isRollBackToEmbedded) {
    onPhase?.('downloading');
    await deps.fetchUpdate();
    // A real newer bundle wins over a rollback directive when both are somehow set:
    // moving the fleet forward is the preferred fix.
    return { shouldReload: true, result: check.isAvailable ? 'reloaded-update' : 'reloaded-rollback' };
  }

  // Nothing new on the server, but an earlier foreground dwell may have already
  // downloaded the fix — launch it without re-fetching.
  if (deps.isUpdatePending()) {
    return { shouldReload: true, result: 'reloaded-pending' };
  }

  // Nothing to apply. Deliberately do NOT reload: it would relaunch the same
  // broken bundle and drop the user right back on this screen.
  return { shouldReload: false, result: 'no-fix-available' };
}

/**
 * Run one recovery attempt: check the OTA server, download whatever fix it has
 * (a newer bundle or a rollback-to-embedded directive), then reload onto it. If
 * the server has nothing new but an update is already downloaded, reload onto
 * that. If there's nothing to apply, resolve `no-fix-available` WITHOUT reloading
 * (reloading would just relaunch the broken bundle).
 *
 * The check+fetch network work is bounded by `deps.timeoutMs` (default 30s) so a
 * hung request resolves to `failed` instead of leaving the caller stuck; `reload`
 * runs outside that budget. Any throw resolves `{ result: 'failed', error }`.
 * `onPhase` drives the button's live status ('checking' → 'downloading').
 *
 * `onBeforeReload` fires synchronously right before each reload with the outcome
 * result, so the caller can emit success telemetry that would otherwise be lost:
 * reloadAsync() resolves right before the app restarts, so anything the caller
 * does after this function returns a reloaded-* result can be torn down first.
 */
export async function performOtaRecovery(
  deps: OtaRecoveryDeps,
  callbacks?: {
    onPhase?: (phase: OtaRecoveryPhase) => void;
    onBeforeReload?: (result: OtaRecoveryResult) => void;
  },
): Promise<{ result: OtaRecoveryResult; error?: unknown }> {
  try {
    const plan = await withTimeout(resolveRecoveryPlan(deps, callbacks?.onPhase), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (plan.shouldReload) {
      // Emit outcome telemetry BEFORE the reload — both the fetched and the pending
      // path funnel through here, so a post-return track() would race the restart
      // and typically be lost.
      callbacks?.onBeforeReload?.(plan.result);
      // Nothing meaningful can run after this: expo-updates resolves reloadAsync()
      // right before it posts the reload, so the app is on its way out here.
      await deps.reload();
    }
    return { result: plan.result };
  } catch (error) {
    return { result: 'failed', error };
  }
}
