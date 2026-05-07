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

  it('disallows crawling /api/, /auth/, /settings, and /you', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(['/api/', '/auth/', '/settings', '/you', '/you/*']));
  });

  it('includes a sitemap URL', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://www.boardsesh.com/sitemap.xml');
  });
});
