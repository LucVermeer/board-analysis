/**
 * Coarse hold semantics from set membership + hole naming. This is the ONLY
 * hold-type signal we own — there is no physical shape/size data anywhere in the
 * DB — so we claim only what set names reliably encode (footholds) and leave the
 * rest NULL rather than inventing jug/crimp/sloper labels we can't derive.
 */

/**
 * Map a hold set name to a coarse type. Foot sets (Kilter "Screw Ons", Tension
 * "Foot Set") are small screw-on footholds. Everything else is left null — a main
 * hold could be any shape and we don't guess.
 */
export function coarseTypeFromSetName(name: string | null | undefined): 'foot' | null {
  if (!name) return null;
  return /\bfoot\b|screw[\s-]?on/i.test(name) ? 'foot' : null;
}

/**
 * Kickboard holes sit on the low kicker panel and are footwork-only. Kilter marks
 * them in the hole grid name ("35,KB1") and in kickboard set names.
 */
export function isKickboardHole(holeName: string | null | undefined, setName: string | null | undefined): boolean {
  if (holeName && /\bKB\d*\b/i.test(holeName)) return true;
  if (setName && /kickboard|kicker/i.test(setName)) return true;
  return false;
}
