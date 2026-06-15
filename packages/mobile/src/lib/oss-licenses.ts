/**
 * App-facing accessor for the bundled third-party license attribution, generated
 * at build time by scripts/generate-oss-licenses.ts. Imported only by the
 * licenses screen so the ~1 MB manifest isn't parsed until that route opens.
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
