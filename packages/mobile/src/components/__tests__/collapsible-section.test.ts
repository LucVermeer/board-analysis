import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '..', 'CollapsibleSection.tsx'), 'utf-8');

describe('CollapsibleSection accessibility', () => {
  it('sets accessibilityLabel on the toggle Pressable', () => {
    expect(source).toContain('accessibilityLabel={title}');
  });

  it('sets accessibilityState with expanded flag', () => {
    expect(source).toContain('accessibilityState={{ expanded }}');
  });
});

describe('CollapsibleSection internal component types', () => {
  it('declares headerAction as optional in the internal component', () => {
    const internalBlock = source.slice(source.indexOf('function CollapsibleSectionInternal'));
    expect(internalBlock).toContain('headerAction?: ReactNode');
  });
});
