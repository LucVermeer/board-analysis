/// <reference types="node" />

/**
 * Pure transforms for the GitHub contributor + sponsor data shown on the mobile
 * Acknowledgements screen. Kept free of I/O so they're unit-testable without
 * hitting the network (see scripts/__tests__/acknowledgements-transform.test.ts).
 */

export type Contributor = {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
};

export type Sponsor = {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
};

export type AcknowledgementsData = {
  generatedAt: string;
  contributors: Contributor[];
  sponsors: Sponsor[];
  /** How many sponsors chose to stay private — surfaced as an anonymous count. */
  privateSponsorCount: number;
};

/** Subset of the GitHub REST `/contributors` shape we rely on. */
export type RawContributor = {
  login?: string;
  avatar_url?: string;
  html_url?: string;
  contributions?: number;
  type?: string;
};

/** Subset of a GraphQL `sponsorshipsAsMaintainer.nodes[]` entry. */
export type RawSponsorNode = {
  sponsorEntity?: {
    __typename?: string;
    login?: string;
    name?: string | null;
    avatarUrl?: string;
    url?: string;
  } | null;
};

// Automation accounts that show up in the REST contributor list but aren't
// people to thank. `type === 'Bot'` covers GitHub Apps; the rest catch bots
// that commit as plain users.
const BOT_LOGINS = new Set([
  'dependabot',
  'dependabot-preview',
  'github-actions',
  'renovate',
  'renovate-bot',
  'codecov',
  'codecov-commenter',
  'snyk-bot',
  'imgbot',
  'allcontributors',
]);

// AI coding assistants that author co-authored commits and so surface in the
// contributor graph as plain users. They're the tools, not the crew — so they're
// filtered out of the human thank-you list.
const AI_LOGINS = new Set([
  'claude',
  'codex',
  'devin',
  'devin-ai-integration',
  'copilot',
  'github-copilot',
  'cursor',
  'cursoragent',
  'chatgpt',
  'openai',
  'anthropic',
]);

export function isBotContributor(raw: RawContributor): boolean {
  if ((raw.type ?? '').toLowerCase() === 'bot') return true;
  const login = (raw.login ?? '').toLowerCase();
  if (!login) return true;
  if (login.endsWith('[bot]')) return true;
  if (login.endsWith('-bot')) return true;
  return BOT_LOGINS.has(login) || AI_LOGINS.has(login);
}

export function transformContributors(raw: RawContributor[], names: Record<string, string | null> = {}): Contributor[] {
  return raw
    .filter(
      (entry): entry is RawContributor & { login: string } =>
        typeof entry.login === 'string' && !isBotContributor(entry),
    )
    .map((entry) => ({
      login: entry.login,
      name: names[entry.login] ?? null,
      avatarUrl: entry.avatar_url ?? '',
      htmlUrl: entry.html_url ?? `https://github.com/${entry.login}`,
      contributions: entry.contributions ?? 0,
    }))
    .sort((first, second) => second.contributions - first.contributions || first.login.localeCompare(second.login));
}

export function transformSponsors(nodes: RawSponsorNode[]): Sponsor[] {
  return nodes
    .map((node) => node.sponsorEntity)
    .filter(
      (entity): entity is NonNullable<RawSponsorNode['sponsorEntity']> & { login: string } =>
        Boolean(entity) && typeof entity?.login === 'string',
    )
    .map((entity) => ({
      login: entity.login,
      name: entity.name ?? null,
      avatarUrl: entity.avatarUrl ?? '',
      url: entity.url ?? `https://github.com/${entity.login}`,
    }));
}
