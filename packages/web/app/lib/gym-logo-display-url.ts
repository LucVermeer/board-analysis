// Gym logos are stored as the backend-relative path POST /api/gym-logos
// returns (`/static/gym-logos/<uuid>.<ext>?v=...`). Storing the relative path
// keeps the database portable — no deploy domain frozen into user data — so
// EVERY render site must resolve it against the backend origin: in
// split-domain deploys (production web + backend on different hosts) the raw
// path would 404 against the frontend host. Absolute URLs (legacy or external)
// pass through untouched.
//
// Callers pass the base explicitly so this stays pure and testable:
//  - client components → getBackendHttpUrl()
//  - server components → getPublicBackendHttpUrl() (BROWSER-reachable origin,
//    never the Docker-internal one)

export function resolveGymLogoDisplayUrl(logoUrl: string | null, backendHttpBaseUrl: string | null): string | null {
  if (!logoUrl) return null;
  if (!logoUrl.startsWith('/')) return logoUrl;
  if (!backendHttpBaseUrl) return logoUrl;
  return `${backendHttpBaseUrl.replace(/\/+$/, '')}${logoUrl}`;
}
