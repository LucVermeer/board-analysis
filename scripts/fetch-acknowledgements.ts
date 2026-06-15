/// <reference types="node" />

/**
 * Generates packages/mobile/src/data/acknowledgements.generated.json — the
 * contributor + sponsor lists shown on the mobile Acknowledgements screen.
 *
 * Contributors come from the GitHub REST API (public, no special scope).
 * Sponsors come from the GitHub GraphQL API for the `boardsesh` org, which needs
 * an authenticated token with sponsors / `read:org` scope — locally that's your
 * `gh` keyring; in CI it's the ACKNOWLEDGEMENTS_GH_TOKEN secret. The default
 * Actions `GITHUB_TOKEN` can read contributors but NOT org sponsors.
 *
 * Degrades gracefully: if a fetch fails (offline, `gh` missing, no sponsor
 * scope) the existing committed JSON for that section is kept and the script
 * still exits 0, so it never breaks a build or CI run. `generatedAt` only moves
 * when the data actually changes, keeping the committed file churn-free.
 *
 * Usage: vp run generate:acknowledgements
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  transformContributors,
  transformSponsors,
  type AcknowledgementsData,
  type Contributor,
  type Sponsor,
  type RawContributor,
  type RawSponsorNode,
} from './lib/acknowledgements-transform';

const REPO_OWNER = 'boardsesh';
const REPO_NAME = 'boardsesh';
const SPONSOR_ORG = 'boardsesh';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(here, '../packages/mobile/src/data/acknowledgements.generated.json');

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readExisting(): AcknowledgementsData {
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as AcknowledgementsData;
  } catch {
    return { generatedAt: '', contributors: [], sponsors: [], privateSponsorCount: 0 };
  }
}

function fetchContributors(): Contributor[] | null {
  try {
    const raw = JSON.parse(
      gh(['api', `repos/${REPO_OWNER}/${REPO_NAME}/contributors?per_page=100`, '--paginate']),
    ) as RawContributor[];
    return transformContributors(raw);
  } catch (error) {
    console.warn(`[acknowledgements] contributors fetch failed, keeping existing list: ${String(error)}`);
    return null;
  }
}

// activeOnly:false so one-time sponsors (and past supporters) are thanked too —
// a one-time gift isn't an "active" recurring subscription, so activeOnly:true
// would silently drop them. includePrivate:false still respects sponsors who
// chose to stay private (they're surfaced only as an anonymous count below).
const PUBLIC_SPONSORS_QUERY = `query($login: String!) {
  organization(login: $login) {
    sponsorshipsAsMaintainer(first: 100, activeOnly: false, includePrivate: false, orderBy: { field: CREATED_AT, direction: ASC }) {
      totalCount
      nodes {
        sponsorEntity {
          __typename
          ... on User { login name avatarUrl url }
          ... on Organization { login name avatarUrl url }
        }
      }
    }
  }
}`;

// includePrivate:true returns the FULL count (public + private) but only when the
// token belongs to the org maintainer (the refresh secret does). private = all − public.
const ALL_SPONSOR_COUNT_QUERY = `query($login: String!) {
  organization(login: $login) {
    sponsorshipsAsMaintainer(first: 1, activeOnly: false, includePrivate: true) {
      totalCount
    }
  }
}`;

function fetchSponsorData(): { sponsors: Sponsor[]; privateCount: number } | null {
  let publicConnection;
  try {
    const response = JSON.parse(
      gh(['api', 'graphql', '-f', `query=${PUBLIC_SPONSORS_QUERY}`, '-f', `login=${SPONSOR_ORG}`]),
    ) as { data?: { organization?: { sponsorshipsAsMaintainer?: { totalCount?: number; nodes?: RawSponsorNode[] } } } };
    publicConnection = response.data?.organization?.sponsorshipsAsMaintainer;
  } catch (error) {
    console.warn(`[acknowledgements] sponsors fetch failed, keeping existing list: ${String(error)}`);
    return null;
  }

  const sponsors = transformSponsors(publicConnection?.nodes ?? []);
  const publicCount = publicConnection?.totalCount ?? sponsors.length;

  // Private count is best-effort: it needs the org-maintainer token, so any
  // failure just means we don't show the anonymous count rather than failing.
  let privateCount = 0;
  try {
    const response = JSON.parse(
      gh(['api', 'graphql', '-f', `query=${ALL_SPONSOR_COUNT_QUERY}`, '-f', `login=${SPONSOR_ORG}`]),
    ) as { data?: { organization?: { sponsorshipsAsMaintainer?: { totalCount?: number } } } };
    const allCount = response.data?.organization?.sponsorshipsAsMaintainer?.totalCount ?? publicCount;
    privateCount = Math.max(0, allCount - publicCount);
  } catch (error) {
    console.warn(`[acknowledgements] private sponsor count unavailable (needs org-maintainer token): ${String(error)}`);
  }

  return { sponsors, privateCount };
}

function main(): void {
  const existing = readExisting();
  const contributors = fetchContributors() ?? existing.contributors;
  const sponsorData = fetchSponsorData();
  const sponsors = sponsorData?.sponsors ?? existing.sponsors;
  const privateSponsorCount = sponsorData?.privateCount ?? existing.privateSponsorCount ?? 0;

  // Keep generatedAt stable when nothing changed so the committed file (and the
  // refresh workflow's "commit only if changed") stays quiet on no-op runs.
  const dataChanged =
    JSON.stringify({ contributors, sponsors, privateSponsorCount }) !==
    JSON.stringify({
      contributors: existing.contributors,
      sponsors: existing.sponsors,
      privateSponsorCount: existing.privateSponsorCount ?? 0,
    });
  const generatedAt = dataChanged || !existing.generatedAt ? new Date().toISOString() : existing.generatedAt;

  const data: AcknowledgementsData = { generatedAt, contributors, sponsors, privateSponsorCount };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `[acknowledgements] wrote ${contributors.length} contributors, ${sponsors.length} public sponsors, ${privateSponsorCount} private`,
  );
}

main();
