import { describe, it, expect } from 'vitest';
import {
  isBotContributor,
  transformContributors,
  transformSponsors,
  type RawContributor,
  type RawSponsorNode,
} from '../lib/acknowledgements-transform';

describe('isBotContributor', () => {
  it('flags GitHub App accounts by type', () => {
    expect(isBotContributor({ login: 'some-app', type: 'Bot' })).toBe(true);
  });

  it('flags [bot] suffix and known automation logins', () => {
    expect(isBotContributor({ login: 'dependabot[bot]', type: 'User' })).toBe(true);
    expect(isBotContributor({ login: 'github-actions', type: 'User' })).toBe(true);
    expect(isBotContributor({ login: 'some-bot', type: 'User' })).toBe(true);
  });

  it('flags AI coding assistants that commit as users', () => {
    expect(isBotContributor({ login: 'claude', type: 'User' })).toBe(true);
    expect(isBotContributor({ login: 'Codex', type: 'User' })).toBe(true);
    expect(isBotContributor({ login: 'devin-ai-integration', type: 'User' })).toBe(true);
  });

  it('keeps real people', () => {
    expect(isBotContributor({ login: 'marcodejongh', type: 'User' })).toBe(false);
  });

  it('treats a missing login as a bot (nothing to thank)', () => {
    expect(isBotContributor({ type: 'User' })).toBe(true);
  });
});

describe('transformContributors', () => {
  const raw: RawContributor[] = [
    { login: 'beta', avatar_url: 'a', html_url: 'hb', contributions: 3, type: 'User' },
    { login: 'dependabot[bot]', contributions: 999, type: 'Bot' },
    { login: 'alpha', avatar_url: 'a', html_url: 'ha', contributions: 10, type: 'User' },
  ];

  it('drops bots and sorts by contributions desc', () => {
    const result = transformContributors(raw);
    expect(result.map((contributor) => contributor.login)).toEqual(['alpha', 'beta']);
  });

  it('defaults name to null and backfills a profile URL when missing', () => {
    const [first] = transformContributors([{ login: 'nourl', contributions: 1, type: 'User' }]);
    expect(first.name).toBeNull();
    expect(first.htmlUrl).toBe('https://github.com/nourl');
  });

  it('uses provided display names when available', () => {
    const [first] = transformContributors([{ login: 'alpha', contributions: 1, type: 'User' }], {
      alpha: 'Alpha Person',
    });
    expect(first.name).toBe('Alpha Person');
  });
});

describe('transformSponsors', () => {
  it('maps user and organization sponsor entities and skips null entities', () => {
    const nodes: RawSponsorNode[] = [
      { sponsorEntity: { __typename: 'User', login: 'patron', name: 'Patron', avatarUrl: 'av', url: 'u' } },
      { sponsorEntity: null },
      { sponsorEntity: { __typename: 'Organization', login: 'sponsorco', name: null, avatarUrl: 'av2', url: 'u2' } },
    ];
    const result = transformSponsors(nodes);
    expect(result).toEqual([
      { login: 'patron', name: 'Patron', avatarUrl: 'av', url: 'u' },
      { login: 'sponsorco', name: null, avatarUrl: 'av2', url: 'u2' },
    ]);
  });

  it('backfills a profile URL when the entity omits one', () => {
    const [first] = transformSponsors([{ sponsorEntity: { login: 'patron' } }]);
    expect(first.url).toBe('https://github.com/patron');
  });
});
