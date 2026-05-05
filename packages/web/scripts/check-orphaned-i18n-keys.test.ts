import { describe, expect, it } from 'vitest';
import { analyzeFile, computeOrphans } from './check-orphaned-i18n-keys';

const fakePath = '/tmp/fake-component.tsx';
const fakeTsPath = '/tmp/fake-helper.ts';

function analyze(source: string, path: string = fakePath) {
  return analyzeFile(path, source);
}

function namespaceOrphans(
  catalog: Record<string, string[]>,
  analyses: ReturnType<typeof analyzeFile>[],
  keepHints: Set<string> = new Set(),
) {
  const catalogMap = new Map<string, Set<string>>();
  for (const [namespace, keys] of Object.entries(catalog)) {
    catalogMap.set(namespace, new Set(keys));
  }
  const usedKeys = new Map<string, Set<string>>();
  const globs = new Map<string, Parameters<typeof computeOrphans>[2] extends Map<string, infer V> ? V : never>();
  for (const analysis of analyses) {
    for (const [namespace, keys] of analysis.usedKeys) {
      let target = usedKeys.get(namespace);
      if (!target) {
        target = new Set();
        usedKeys.set(namespace, target);
      }
      for (const key of keys) target.add(key);
    }
    for (const [namespace, patterns] of analysis.globs) {
      const target = globs.get(namespace) ?? [];
      target.push(...patterns);
      globs.set(namespace, target);
    }
    for (const hint of analysis.keepHints) keepHints.add(hint);
  }
  return computeOrphans(catalogMap, usedKeys, globs, keepHints);
}

describe('static t() calls', () => {
  it('records the key against the namespace from useTranslation', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo() {
        const { t } = useTranslation('marketing');
        return <span>{t('home.hero.title')}</span>;
      }
    `);
    expect(analysis.usedKeys.get('marketing')?.has('home.hero.title')).toBe(true);
    expect(analysis.unanalyzable).toHaveLength(0);
  });

  it('defaults to the common namespace when useTranslation has no argument', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo() {
        const { t } = useTranslation();
        return <span>{t('greeting')}</span>;
      }
    `);
    expect(analysis.usedKeys.get('common')?.has('greeting')).toBe(true);
  });

  it('honours an explicit ns:key prefix and ignores the binding namespace', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo() {
        const { t } = useTranslation('common');
        return <span>{t('marketing:home.hero.title')}</span>;
      }
    `);
    expect(analysis.usedKeys.get('marketing')?.has('home.hero.title')).toBe(true);
    expect(analysis.usedKeys.get('common')?.has('marketing:home.hero.title')).toBeFalsy();
  });

  it('records the key in every bound namespace when useTranslation gets an array', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo() {
        const { t } = useTranslation(['climbs', 'session']);
        return <span>{t('shared.label')}</span>;
      }
    `);
    expect(analysis.usedKeys.get('climbs')?.has('shared.label')).toBe(true);
    expect(analysis.usedKeys.get('session')?.has('shared.label')).toBe(true);
  });

  it('resolves t bindings from getServerTranslation', () => {
    const analysis = analyze(`
      import { getServerTranslation } from '@/app/lib/i18n/server';
      export default async function Page() {
        const { t } = await getServerTranslation('marketing');
        return <h1>{t('about.headerTitle')}</h1>;
      }
    `);
    expect(analysis.usedKeys.get('marketing')?.has('about.headerTitle')).toBe(true);
  });
});

describe('template literal globs', () => {
  it('emits a wildcard glob for `prefix.${expr}.suffix` and matches catalog keys', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo({ kind }: { kind: string }) {
        const { t } = useTranslation('admin');
        return <span>{t(\`settings.rows.\${kind}.label\`)}</span>;
      }
    `);
    const orphans = namespaceOrphans(
      {
        admin: ['settings.rows.foo.label', 'settings.rows.bar.label', 'settings.unrelated'],
      },
      [analysis],
    );
    expect(orphans.map((orphan) => orphan.key)).toEqual(['settings.unrelated']);
  });

  it('handles a dynamic segment at the trailing position', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo({ code }: { code: string }) {
        const { t } = useTranslation('auth');
        return <span>{t(\`error.messages.\${code}\`)}</span>;
      }
    `);
    const orphans = namespaceOrphans(
      { auth: ['error.messages.AccessDenied', 'error.messages.Verification', 'login.title'] },
      [analysis],
    );
    expect(orphans.map((orphan) => orphan.key)).toEqual(['login.title']);
  });

  it('treats `ns:${expr}.suffix` template namespaces as glob over that namespace only', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo({ slot }: { slot: string }) {
        const { t } = useTranslation('common');
        return <span>{t(\`marketing:\${slot}.title\`)}</span>;
      }
    `);
    const orphans = namespaceOrphans(
      {
        marketing: ['hero.title', 'about.title'],
        common: ['hero.title'],
      },
      [analysis],
    );
    // The marketing keys match the glob; the common one is unaffected.
    expect(orphans.map((orphan) => `${orphan.namespace}:${orphan.key}`)).toEqual(['common:hero.title']);
  });
});

describe('Trans component', () => {
  it('records i18nKey from <Trans> using the surrounding useTranslation namespace', () => {
    const analysis = analyze(`
      import { useTranslation, Trans } from 'react-i18next';
      export default function Foo() {
        const { t } = useTranslation('settings');
        return <Trans i18nKey="account.delete.body" t={t} components={{ strong: <strong /> }} />;
      }
    `);
    expect(analysis.usedKeys.get('settings')?.has('account.delete.body')).toBe(true);
  });
});

describe('TFunction parameter bindings', () => {
  it("uses the namespace from `TFunction<'auth'>` annotations", () => {
    const analysis = analyze(
      `
      import type { TFunction } from 'i18next';
      export function getAuthErrorMessage(code: string, t: TFunction<'auth'>) {
        return t('error.messages.default');
      }
    `,
      fakeTsPath,
    );
    expect(analysis.usedKeys.get('auth')?.has('error.messages.default')).toBe(true);
  });

  it('falls back to "any namespace" for bare `TFunction`, suppressing orphan reports across all namespaces', () => {
    const analysis = analyze(
      `
      import type { TFunction } from 'i18next';
      export function format(t: TFunction) {
        return t('shared.label');
      }
    `,
      fakeTsPath,
    );
    const orphans = namespaceOrphans(
      {
        common: ['shared.label', 'unused'],
        feed: ['shared.label'],
      },
      [analysis],
    );
    expect(orphans.map((orphan) => `${orphan.namespace}:${orphan.key}`)).toEqual(['common:unused']);
  });

  it("handles a tuple namespace annotation `TFunction<['climbs', 'session']>`", () => {
    const analysis = analyze(
      `
      import type { TFunction } from 'i18next';
      export function format(t: TFunction<['climbs', 'session']>) {
        return t('shared.label');
      }
    `,
      fakeTsPath,
    );
    expect(analysis.usedKeys.get('climbs')?.has('shared.label')).toBe(true);
    expect(analysis.usedKeys.get('session')?.has('shared.label')).toBe(true);
  });
});

describe('plural variants', () => {
  it('treats `_one`/`_other`/`_few` keys as referenced when the base key is referenced', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo() {
        const { t } = useTranslation('admin');
        return <span>{t('settings.snackbar.saved', { count: 1 })}</span>;
      }
    `);
    const orphans = namespaceOrphans(
      {
        admin: [
          'settings.snackbar.saved',
          'settings.snackbar.saved_one',
          'settings.snackbar.saved_other',
          'settings.snackbar.saved_few',
        ],
      },
      [analysis],
    );
    expect(orphans).toEqual([]);
  });

  it('still flags an unused base whose plural variants are also unreferenced', () => {
    const orphans = namespaceOrphans(
      { admin: ['unused.thing_one', 'unused.thing_other'] },
      [analyze(`export const noop = 1;`, fakeTsPath)],
    );
    expect(orphans.map((orphan) => orphan.key).sort()).toEqual([
      'unused.thing_one',
      'unused.thing_other',
    ]);
  });
});

describe('// i18n-keep markers', () => {
  it('exempts a key listed in a keep marker', () => {
    const analysis = analyze(
      `
      // i18n-keep common.headerCopy.legacyTitle
      export const noop = 1;
    `,
      fakeTsPath,
    );
    const orphans = namespaceOrphans(
      { common: ['headerCopy.legacyTitle', 'unused'] },
      [analysis],
    );
    expect(orphans.map((orphan) => orphan.key)).toEqual(['unused']);
  });

  it('accepts the colon form `// i18n-keep ns:key.path`', () => {
    const analysis = analyze(
      `
      // i18n-keep common:headerCopy.legacyTitle
      export const noop = 1;
    `,
      fakeTsPath,
    );
    const orphans = namespaceOrphans(
      { common: ['headerCopy.legacyTitle'] },
      [analysis],
    );
    expect(orphans).toEqual([]);
  });
});

describe('unanalyzable t() arguments', () => {
  it('records a hard-fail site for `t(variable)`', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo({ key }: { key: string }) {
        const { t } = useTranslation('common');
        return <span>{t(key)}</span>;
      }
    `);
    expect(analysis.unanalyzable).toHaveLength(1);
    expect(analysis.unanalyzable[0].snippet).toBe('key');
  });

  it("records a hard-fail site for `t('a' + b)`", () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export default function Foo({ suffix }: { suffix: string }) {
        const { t } = useTranslation('common');
        return <span>{t('prefix.' + suffix)}</span>;
      }
    `);
    expect(analysis.unanalyzable).toHaveLength(1);
  });

  it('does not flag non-i18n calls that happen to have a variable argument', () => {
    const analysis = analyze(`
      export default function Foo({ message }: { message: string }) {
        console.log(message);
        return null;
      }
    `);
    expect(analysis.unanalyzable).toHaveLength(0);
  });
});

describe('scope resolution', () => {
  it('picks the closest enclosing useTranslation when several exist in one file', () => {
    const analysis = analyze(`
      import { useTranslation } from 'react-i18next';
      export function Outer() {
        const { t } = useTranslation('common');
        return <span>{t('outer.label')}</span>;
      }
      export function Inner() {
        const { t } = useTranslation('feed');
        return <span>{t('inner.label')}</span>;
      }
    `);
    expect(analysis.usedKeys.get('common')?.has('outer.label')).toBe(true);
    expect(analysis.usedKeys.get('feed')?.has('inner.label')).toBe(true);
    expect(analysis.usedKeys.get('feed')?.has('outer.label')).toBeFalsy();
    expect(analysis.usedKeys.get('common')?.has('inner.label')).toBeFalsy();
  });
});
