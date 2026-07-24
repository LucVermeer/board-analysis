/**
 * A climb can only be lit on the wall once its `frames` have synced.
 *
 * `Climb.frames` is typed non-null, but the queue's wire boundary is untyped: a
 * party peer can broadcast a partially-synced climb (uuid + name, no frames
 * yet), and a server FullSync or local snapshot restore can land an unhydrated
 * item as the current climb. Writing an empty frames string is the Aurora /
 * MoonBoard "clear all LEDs" command, so auto-sending an unresolved climb would
 * dark-fire the wall (and silently buzz success). This predicate gates the BLE
 * auto-sender: hold the write until the frames arrive, then the effect re-runs
 * on the resolved item (new identity, real frames) and lights it.
 *
 * Deliberately narrow — it only asks "are there frames to render". If PR #3763
 * re-lands its richer `isClimbResolved` (uuid + name + frames), converge on that
 * where a fuller resolution check is wanted; the auto-sender only needs frames.
 */
export function hasRenderableFrames(climb: { frames?: string | null } | null | undefined): boolean {
  return typeof climb?.frames === 'string' && climb.frames.trim().length > 0;
}
