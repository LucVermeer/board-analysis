export const PAGE_LIMIT = 20;
export const MAX_PAGE_SIZE = 100; // Maximum page size to prevent excessive database queries

/**
 * On page=0 SSR (the default landing case), we only need enough climbs to
 * fill the first viewport — SWR fetches the rest after hydration. Shipping
 * fewer climbs in the SSR HTML/RSC payload speeds up mobile parse time.
 * Roughly one viewport of cards: keep it small but big enough that a fast
 * mobile scroll doesn't outrun SWR's first fetch.
 */
export const SSR_INITIAL_PAGE_SIZE = 10;

// Threshold for proactive fetching of suggestions
// When suggestedClimbs falls below this, we fetch more automatically
// Set to 10 to keep a healthy buffer of suggestions available
export const SUGGESTIONS_THRESHOLD = 10;
