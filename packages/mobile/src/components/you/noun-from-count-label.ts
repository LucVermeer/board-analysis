/**
 * Strip only a leading number plus its separators/whitespace from an
 * already-translated `"{{count}} <noun>"` label so the chip can show the bare
 * noun on its label line (the number is shown separately as the chip value).
 * If there is no leading number the string is returned unchanged, so a future
 * count-last or no-space locale degrades gracefully instead of silently
 * dropping a word. Supported locales: en-US / es / fr.
 */
export function nounFromCountLabel(countLabel: string): string {
  return countLabel.replace(/^\d[\d.,\u00A0\u202F ]*\s+/, '');
}
