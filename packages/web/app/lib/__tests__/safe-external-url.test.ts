import { describe, it, expect } from 'vite-plus/test';
import { safeExternalHref } from '../safe-external-url';

describe('safeExternalHref', () => {
  it('passes http and https URLs through unchanged', () => {
    expect(safeExternalHref('https://example.com')).toBe('https://example.com');
    expect(safeExternalHref('http://example.com/path?a=1')).toBe('http://example.com/path?a=1');
  });

  it('rejects javascript: URIs (clickable XSS that rel=noopener does not block)', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    // URL() strips leading control characters/whitespace, so this still parses
    // as a javascript: URL — the protocol check must catch it.
    expect(safeExternalHref(' javascript:alert(1)')).toBeNull();
    expect(safeExternalHref('JavaScript:alert(1)')).toBeNull();
  });

  it('rejects other non-http schemes', () => {
    expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeExternalHref('ftp://example.com')).toBeNull();
    expect(safeExternalHref('file:///etc/passwd')).toBeNull();
  });

  it('rejects schemeless and malformed values', () => {
    expect(safeExternalHref('example.com')).toBeNull();
    expect(safeExternalHref('//example.com')).toBeNull();
    expect(safeExternalHref('not a url')).toBeNull();
  });

  it('returns null for null, undefined, and empty input', () => {
    expect(safeExternalHref(null)).toBeNull();
    expect(safeExternalHref(undefined)).toBeNull();
    expect(safeExternalHref('')).toBeNull();
  });
});
