/**
 * Extracts up to 2 uppercase initials from a display name.
 * "John Doe" → "JD", "Alice" → "A", "" → ""
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
