/**
 * App-facing accessor for the bundled third-party license attribution, generated
 * at build time by scripts/generate-oss-licenses.ts. Metro inlines this ~1 MB JSON
 * into the JS bundle; only the licenses screen imports it.
 */
import licenses from '../data/oss-licenses.generated.json';

export type OssLicense = {
  name: string;
  version: string;
  license: string;
  repository: string | null;
  publisher: string | null;
  licenseText: string | null;
};

export const ossLicenses = licenses as OssLicense[];
