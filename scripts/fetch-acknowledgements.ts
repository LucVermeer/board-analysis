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
    return { generatedAt: '', contributors: [], sponsors: [] };
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

const SPONSORS_QUERY = `query($login: String!) {
  organization(login: $login) {
    sponsorshipsAsMaintainer(first: 100, activeOnly: true, includePrivate: false, orderBy: { field: CREATED_AT, direction: ASC }) {
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

function fetchSponsors(): Sponsor[] | null {
  try {
    const response = JSON.parse(
      gh(['api', 'graphql', '-f', `query=${SPONSORS_QUERY}`, '-f', `login=${SPONSOR_ORG}`]),
    ) as { data?: { organization?: { sponsorshipsAsMaintainer?: { nodes?: RawSponsorNode[] } } } };
    const nodes = response.data?.organization?.sponsorshipsAsMaintainer?.nodes ?? [];
    return transformSponsors(nodes);
  } catch (error) {
    console.warn(`[acknowledgements] sponsors fetch failed, keeping existing list: ${String(error)}`);
    return null;
  }
}

function main(): void {
  const existing = readExisting();
  const contributors = fetchContributors() ?? existing.contributors;
  const sponsors = fetchSponsors() ?? existing.sponsors;

  // Keep generatedAt stable when nothing changed so the committed file (and the
  // refresh workflow's "commit only if changed") stays quiet on no-op runs.
  const dataChanged =
    JSON.stringify({ contributors, sponsors }) !==
    JSON.stringify({ contributors: existing.contributors, sponsors: existing.sponsors });
  const generatedAt = dataChanged || !existing.generatedAt ? new Date().toISOString() : existing.generatedAt;

  const data: AcknowledgementsData = { generatedAt, contributors, sponsors };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[acknowledgements] wrote ${contributors.length} contributors, ${sponsors.length} sponsors`);
}

main();
