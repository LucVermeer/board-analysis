import { describe, it, expect, vi } from 'vite-plus/test';
import { THEME_INIT_SCRIPT, COLOR_MODE_MIRROR_KEY } from '../theme-init-script';

// The script is injected as an inline <script> and reads the bare globals
// localStorage / window / document at runtime. We evaluate it in isolation by
// binding those names to stubs via new Function, then assert which value it
// wrote to data-theme.
type RunOptions = {
  stored?: string | null;
  storageThrows?: boolean;
  osPrefersDark?: boolean;
  hasMatchMedia?: boolean;
};

function runInitScript({
  stored = null,
  storageThrows = false,
  osPrefersDark = false,
  hasMatchMedia = true,
}: RunOptions): { theme: string | undefined; readKey: string | undefined } {
  let readKey: string | undefined;
  const setAttribute = vi.fn<(name: string, value: string) => void>();

  const localStorageStub = {
    getItem: (key: string): string | null => {
      readKey = key;
      if (storageThrows) throw new Error('storage disabled');
      return stored;
    },
  };
  const matchMediaStub = (query: string) => ({ matches: query.includes('dark') ? osPrefersDark : false });
  const windowStub = hasMatchMedia ? { matchMedia: matchMediaStub } : {};
  const documentStub = { documentElement: { setAttribute } };

  // oxlint-disable-next-line no-implied-eval
  const evaluate = new Function('window', 'document', 'localStorage', THEME_INIT_SCRIPT) as (
    window: unknown,
    document: unknown,
    localStorage: unknown,
  ) => void;
  evaluate(windowStub, documentStub, localStorageStub);

  const call = setAttribute.mock.calls[0];
  expect(call?.[0]).toBe('data-theme');
  return { theme: call?.[1], readKey };
}

describe('THEME_INIT_SCRIPT', () => {
  it('reads the shared mirror key', () => {
    const { readKey } = runInitScript({ stored: 'light' });
    expect(readKey).toBe(COLOR_MODE_MIRROR_KEY);
  });

  it('applies a saved light preference', () => {
    expect(runInitScript({ stored: 'light' }).theme).toBe('light');
  });

  it('applies a saved dark preference', () => {
    expect(runInitScript({ stored: 'dark' }).theme).toBe('dark');
  });

  it('falls back to light when nothing is saved and the OS prefers light', () => {
    expect(runInitScript({ stored: null, osPrefersDark: false }).theme).toBe('light');
  });

  it('falls back to dark when nothing is saved and the OS prefers dark', () => {
    expect(runInitScript({ stored: null, osPrefersDark: true }).theme).toBe('dark');
  });

  it('falls back to matchMedia when localStorage throws (privacy mode)', () => {
    expect(runInitScript({ storageThrows: true, osPrefersDark: true }).theme).toBe('dark');
    expect(runInitScript({ storageThrows: true, osPrefersDark: false }).theme).toBe('light');
  });

  it('falls back to matchMedia when the stored value is garbage', () => {
    expect(runInitScript({ stored: 'purple', osPrefersDark: true }).theme).toBe('dark');
    expect(runInitScript({ stored: 'purple', osPrefersDark: false }).theme).toBe('light');
  });

  it('defaults to light when matchMedia is unavailable and nothing is saved', () => {
    expect(runInitScript({ stored: null, hasMatchMedia: false }).theme).toBe('light');
  });
});
