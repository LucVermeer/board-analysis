import type { SmartPlaylistType } from '@boardsesh/graphql/operations/playlists';
import { themeTokens } from '@/app/theme/theme-config';

export type SmartPlaylistSlug = 'five-stars' | 'most-repeated' | 'projects';

export type SmartPlaylistPresentation = {
  type: SmartPlaylistType;
  slug: SmartPlaylistSlug;
  icon: string;
  color: string;
  /** i18n key under the `playlists` namespace for the card / page title. */
  titleI18nKey: string;
  /** i18n key for a one-line description shown on the detail page header. */
  descriptionI18nKey: string;
};

export const SMART_PLAYLISTS: SmartPlaylistPresentation[] = [
  {
    type: 'FIVE_STARS',
    slug: 'five-stars',
    icon: '⭐',
    color: themeTokens.colors.amber,
    titleI18nKey: 'library.smart.fiveStars.title',
    descriptionI18nKey: 'library.smart.fiveStars.description',
  },
  {
    type: 'MOST_REPEATED',
    slug: 'most-repeated',
    icon: '🔁',
    color: themeTokens.colors.purple,
    titleI18nKey: 'library.smart.mostRepeated.title',
    descriptionI18nKey: 'library.smart.mostRepeated.description',
  },
  {
    type: 'PROJECTS',
    slug: 'projects',
    icon: '🎯',
    color: themeTokens.colors.accentRose,
    titleI18nKey: 'library.smart.projects.title',
    descriptionI18nKey: 'library.smart.projects.description',
  },
];

const BY_SLUG = new Map<string, SmartPlaylistPresentation>(SMART_PLAYLISTS.map((p) => [p.slug, p]));
const BY_TYPE = new Map<SmartPlaylistType, SmartPlaylistPresentation>(SMART_PLAYLISTS.map((p) => [p.type, p]));

export function smartPlaylistBySlug(slug: string): SmartPlaylistPresentation | undefined {
  return BY_SLUG.get(slug);
}

export function smartPlaylistByType(type: SmartPlaylistType): SmartPlaylistPresentation {
  const found = BY_TYPE.get(type);
  if (!found) throw new Error(`Unknown smart playlist type: ${String(type)}`);
  return found;
}

export function smartPlaylistHref(slug: SmartPlaylistSlug, userId: string): string {
  return `/discover/${slug}/${encodeURIComponent(userId)}`;
}
