import { describe, expect, it } from 'vitest';
import { parseSetCookieHeaders } from './moonboard-client';

describe('parseSetCookieHeaders', () => {
  it('extracts cookie name/value pairs from combined Set-Cookie headers', () => {
    expect(
      parseSetCookieHeaders([
        'ARRAffinity=abc; path=/; HttpOnly, __RequestVerificationToken=def; path=/; secure; HttpOnly',
      ]),
    ).toEqual(['ARRAffinity=abc', '__RequestVerificationToken=def']);
  });
});
