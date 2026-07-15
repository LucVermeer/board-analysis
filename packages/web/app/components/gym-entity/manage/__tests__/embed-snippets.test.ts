import { describe, expect, it } from 'vitest';
import { buildBoardEmbedSnippet, buildLeaderboardEmbedSnippet, escapeHtmlAttribute } from '../embed-snippets';

const boardUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const gymUuid = '99999999-8888-4777-8666-555555555555';

describe('buildBoardEmbedSnippet', () => {
  it('builds the uuid-keyed live board iframe', () => {
    expect(buildBoardEmbedSnippet({ boardUuid, boardName: 'Main Kilter' })).toBe(
      `<iframe src="https://www.boardsesh.com/embed/board/${boardUuid}" width="100%" height="640" style="border:0" loading="lazy" title="Main Kilter — live"></iframe>`,
    );
  });

  it('escapes the board name inside the title attribute', () => {
    const snippet = buildBoardEmbedSnippet({ boardUuid, boardName: '12" <Steep> & Co' });
    expect(snippet).toContain('title="12&quot; &lt;Steep&gt; &amp; Co — live"');
    // The raw name must never appear unescaped in the markup.
    expect(snippet).not.toContain('12" <Steep>');
  });
});

describe('buildLeaderboardEmbedSnippet', () => {
  it('builds the weekly-default leaderboard iframe', () => {
    expect(buildLeaderboardEmbedSnippet({ gymUuid, gymName: 'Crux House' })).toBe(
      `<iframe src="https://www.boardsesh.com/embed/gym/${gymUuid}/leaderboard?period=week" width="100%" height="520" style="border:0" loading="lazy" title="Crux House — leaderboard"></iframe>`,
    );
  });
});

describe('escapeHtmlAttribute', () => {
  it('escapes ampersands first so entities are not double-escaped', () => {
    expect(escapeHtmlAttribute('&quot;')).toBe('&amp;quot;');
    expect(escapeHtmlAttribute('a & b "c" <d>')).toBe('a &amp; b &quot;c&quot; &lt;d&gt;');
  });
});
