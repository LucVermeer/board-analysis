export function buildStaticGymLogoUrl(fileName: string, version: string): string {
  return `/static/gym-logos/${fileName}?v=${encodeURIComponent(version)}`;
}
