import { describe, it, expect } from 'vite-plus/test';
import robots from '../robots';

describe('robots', () => {
  it('allows crawling the root path', () => {
    const result = robots();
    expect(result.rules).toMatchObject({
      userAgent: '*',
      allow: '/',
    });
  });

  it('disallows crawling /feed, /api/, /auth/, and /settings', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(['/feed', '/api/', '/auth/', '/settings']));
  });

  it('includes a sitemap URL', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://www.boardsesh.com/sitemap.xml');
  });
});
