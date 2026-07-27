/// <reference types="node" />

/**
 * Pure helpers for reasoning about the Drizzle migration folder
 * (`packages/db/drizzle/`) and its `meta/_journal.json`.
 *
 * Shared by `scripts/check-db-migrations.ts` (the PR-time validator) and
 * `scripts/db-renumber-migration.ts` (the renumber engine). Everything here is
 * side-effect free so both callers can be unit tested without a git tree, a
 * database, or drizzle-kit.
 *
 * Three properties of the real folder drive the shapes below, and each one has
 * bitten this repo already:
 *
 *  - **Ordering is by `when`, not by number.** `packages/db/scripts/migrate.ts`
 *    and `scripts/dev-db-up.sh` both select entries whose `when` is newer than
 *    the last applied migration. A renumbered migration whose `when` lands at or
 *    below an already-applied timestamp is skipped *forever*, silently, in
 *    production. Hence `nextWhen()` and its clamp.
 *  - **Numbers are not unique and not aligned to `idx`.** Main carries duplicate
 *    prefixes (`0025`, `0048`–`0052`, `0177`) from past hand-merges, and 30
 *    journal entries have a `tag` prefix that differs from their `idx`. So the
 *    next free number is `max(journal tail idx, max on-disk prefix) + 1`, never
 *    just the journal tail — drizzle-kit itself only looks at the journal tail,
 *    which is why an orphan above the tail would let it re-collide.
 *  - **A `.sql` file with no journal entry is invisible and dead.** Nothing ever
 *    applies it. `0177_illegal_omega_red.sql` sat on main in exactly that state,
 *    left by a hand-renumber that added the new file and forgot to remove the
 *    old one. `findOrphans()` is what catches that class.
 */

/** One `meta/_journal.json` entry, in drizzle-kit's v7 shape. */
export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

/** A migration file's identity, parsed from `NNNN_suffix.sql`. */
export interface MigrationFile {
  /** The 4-digit numeric prefix. */
  index: number;
  /** Everything after the prefix, without the `.sql` extension. */
  suffix: string;
  /** `NNNN_suffix` — how the journal and `dedup-replay.ts` refer to a migration. */
  tag: string;
  /** The basename, `NNNN_suffix.sql`. */
  filename: string;
}

/** Migration filenames are always a zero-padded 4-digit index, an underscore, then a name. */
const MIGRATION_FILE_RE = /^(\d{4})_(.+)\.sql$/;

/** A journal tag is the filename without the extension. */
const MIGRATION_TAG_RE = /^(\d{4})_(.+)$/;

/**
 * The first line `drizzle-kit generate --custom` writes. Its presence means the
 * migration carries hand-written DDL/DML rather than a generated schema diff, so
 * the renumber engine must preserve the body verbatim rather than trusting a
 * regenerated one.
 */
export const CUSTOM_SENTINEL = '-- Custom SQL migration file, put your code below! --';

/** The path of the migration folder, relative to the repo root. */
export const DRIZZLE_DIR = 'packages/db/drizzle';

/** The path of the journal, relative to the repo root. */
export const JOURNAL_PATH = `${DRIZZLE_DIR}/meta/_journal.json`;

/** PURE: zero-pad a migration index the way drizzle-kit's `index` prefix mode does. */
export function padIndex(index: number): string {
  return index.toFixed(0).padStart(4, '0');
}

/**
 * PURE: parse `_journal.json`.
 *
 * Deliberately strict — a malformed journal must fail loudly here rather than
 * flow into a renumber that rewrites it. drizzle-kit's own reader responds to a
 * malformed journal with a bare `process.exit(0)`, so we cannot lean on it.
 */
export function parseJournal(text: string): Journal {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('journal is not an object');
  }
  const candidate = parsed as Partial<Journal>;
  if (!Array.isArray(candidate.entries)) {
    throw new Error('journal has no entries array');
  }
  for (const entry of candidate.entries) {
    if (typeof entry.idx !== 'number' || typeof entry.when !== 'number' || typeof entry.tag !== 'string') {
      throw new Error(`journal entry is malformed: ${JSON.stringify(entry)}`);
    }
  }
  return {
    version: candidate.version ?? '7',
    dialect: candidate.dialect ?? 'postgresql',
    entries: candidate.entries,
  };
}

/**
 * PURE: serialize `_journal.json` byte-identically to how drizzle-kit writes it —
 * two-space indent and **no trailing newline**.
 *
 * The folder is in `.prettierignore` (`**\/drizzle/meta/`), so nothing else in the
 * toolchain would normalize a formatting drift back; a stray newline would show up
 * as noise in every future migration diff.
 */
export function serializeJournal(journal: Journal): string {
  return JSON.stringify(journal, null, 2);
}

/** PURE: parse `NNNN_suffix.sql`; null when the name is not a migration file. */
export function parseMigrationFilename(filename: string): MigrationFile | null {
  const match = MIGRATION_FILE_RE.exec(filename);
  if (!match) return null;
  const [, prefix, suffix] = match;
  return { index: Number(prefix), suffix, tag: `${prefix}_${suffix}`, filename };
}

/** PURE: the numeric prefix of a journal tag (`0187_greedy_thing` → 187); null if unparseable. */
export function migrationIndex(tag: string): number | null {
  const match = MIGRATION_TAG_RE.exec(tag);
  return match ? Number(match[1]) : null;
}

/** PURE: keep only the entries of a directory listing that are migration files. */
export function migrationFiles(filenames: readonly string[]): MigrationFile[] {
  return filenames
    .map(parseMigrationFilename)
    .filter((entry): entry is MigrationFile => entry !== null)
    .sort((left, right) => left.index - right.index || left.filename.localeCompare(right.filename));
}

/**
 * PURE: the next migration number that is free on the given tree.
 *
 * Takes the max of the journal tail and every on-disk prefix, because the two can
 * disagree: drizzle-kit derives its next number from the journal tail alone, so an
 * orphaned `.sql` sitting above the tail would let it hand out a number that is
 * already taken on disk.
 */
export function nextFreeIndex(journal: Journal, filenames: readonly string[]): number {
  const journalTail = journal.entries.length === 0 ? -1 : (journal.entries[journal.entries.length - 1]?.idx ?? -1);
  const journalMaxTagIndex = journal.entries.reduce(
    (highest, entry) => Math.max(highest, migrationIndex(entry.tag) ?? -1),
    -1,
  );
  const diskMax = migrationFiles(filenames).reduce((highest, file) => Math.max(highest, file.index), -1);
  return Math.max(journalTail, journalMaxTagIndex, diskMax) + 1;
}

/**
 * PURE: which migrations exist on the branch but not on the base.
 *
 * A set difference over directory listings rather than `git diff --diff-filter=A`,
 * because a branch that was already renumbered once shows its migration as a
 * *rename*, which an added-files filter misses entirely.
 */
export function addedMigrations(baseFilenames: readonly string[], headFilenames: readonly string[]): MigrationFile[] {
  const base = new Set(migrationFiles(baseFilenames).map((file) => file.filename));
  return migrationFiles(headFilenames).filter((file) => !base.has(file.filename));
}

/**
 * PURE: does this branch's migration set need renumbering against a base whose
 * next free number is `nextFree`?
 *
 * True when any added migration sits at or below a number the base already uses.
 * A branch already sitting contiguously above the base is left alone — the whole
 * point of the fan-out is to touch only PRs that actually collide.
 */
export function collides(added: readonly MigrationFile[], nextFree: number): boolean {
  return added.some((file) => file.index < nextFree);
}

/** PURE: does this body carry hand-written SQL rather than a generated schema diff? */
export function isCustomMigration(body: string): boolean {
  return body.trimStart().startsWith(CUSTOM_SENTINEL);
}

/** PURE: the newest `when` recorded anywhere in the journal. */
export function maxWhen(journal: Journal): number {
  return journal.entries.reduce((highest, entry) => Math.max(highest, entry.when), 0);
}

/**
 * PURE: a `when` for a renumbered migration.
 *
 * Must be strictly greater than every `when` already in the journal, or the
 * appliers — which compare against the newest applied `created_at`, not against
 * the migration number — skip it permanently. The clamp matters because the
 * journal is *not* globally monotonic (seven historical entries regress), so
 * "later in the array" does not imply "larger `when`", and a runner with a skewed
 * clock could otherwise mint a timestamp in the past.
 */
export function nextWhen(previousMax: number, now: number): number {
  return Math.max(now, previousMax + 1);
}

/** PURE: build the journal entry for a migration at a given index. */
export function journalEntryFor(index: number, suffix: string, when: number): JournalEntry {
  return {
    idx: index,
    version: '7',
    when,
    tag: `${padIndex(index)}_${suffix}`,
    breakpoints: true,
  };
}

export interface OrphanReport {
  /** Migration files on disk that no journal entry references — dead, never applied. */
  sqlWithoutEntry: string[];
  /** Journal entries whose `.sql` file is missing — would crash the migrator. */
  entryWithoutSql: string[];
}

/**
 * PURE: cross-check the folder against the journal.
 *
 * `sqlWithoutEntry` is the `0177_illegal_omega_red.sql` failure mode: a file that
 * looks like a migration, is tracked in git, is reviewed as if it will run, and is
 * in fact inert. `entryWithoutSql` is the mirror image and is worse — the migrator
 * throws when it cannot read a journalled file.
 */
export function findOrphans(journal: Journal, filenames: readonly string[]): OrphanReport {
  const journalTags = new Set(journal.entries.map((entry) => entry.tag));
  const diskTags = new Map(migrationFiles(filenames).map((file) => [file.tag, file.filename]));

  return {
    sqlWithoutEntry: [...diskTags.entries()]
      .filter(([tag]) => !journalTags.has(tag))
      .map(([, filename]) => filename)
      .sort(),
    entryWithoutSql: journal.entries
      .map((entry) => entry.tag)
      .filter((tag) => !diskTags.has(tag))
      .sort(),
  };
}

/** PURE: migration files sharing a numeric prefix, which makes apply order ambiguous. */
export function duplicateIndexes(filenames: readonly string[]): number[] {
  const seen = new Map<number, number>();
  for (const file of migrationFiles(filenames)) {
    seen.set(file.index, (seen.get(file.index) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([index]) => index)
    .sort((left, right) => left - right);
}

export interface RenumberMove {
  from: MigrationFile;
  toIndex: number;
  toFilename: string;
  toTag: string;
}

/**
 * PURE: assign each added migration its new number, preserving relative order.
 *
 * Throws when the branch itself already contains two migrations at the same
 * number — that input is ambiguous about apply order, and guessing would be worse
 * than refusing.
 */
export function planRenumber(added: readonly MigrationFile[], nextFree: number): RenumberMove[] {
  const duplicates = duplicateIndexes(added.map((file) => file.filename));
  if (duplicates.length > 0) {
    throw new Error(
      `this branch adds more than one migration at ${duplicates.map(padIndex).join(', ')} — ` +
        'apply order is ambiguous, renumber by hand',
    );
  }
  return added.map((file, offset) => {
    const toIndex = nextFree + offset;
    const toTag = `${padIndex(toIndex)}_${file.suffix}`;
    return { from: file, toIndex, toFilename: `${toTag}.sql`, toTag };
  });
}

/**
 * PURE: rewrite whole-tag references in a text file.
 *
 * Word-boundary matched with a negative lookahead so renaming `0187_foo` leaves
 * `0187_foo_bar` alone.
 *
 * Callers must never apply this to a migration *body*. Seven migrations on main
 * write an idempotency guard row into `_bs_migration_guards`, and that key is not
 * the filename — `0163_merge_moonboard_duplicates.sql` guards on
 * `0162_merge_moonboard_duplicates`, `0154_rescale_climb_stats_history_quality.sql`
 * on `0154_history_quality_rescale`. The guard is a semantic identity, so rewriting
 * it would make an already-applied migration run a second time on every machine
 * that had applied the old number.
 */
export function rewriteTagReferences(text: string, oldTag: string, newTag: string): string {
  const escaped = oldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(String.raw`\b${escaped}\b(?![\w-])`, 'g'), newTag);
}
