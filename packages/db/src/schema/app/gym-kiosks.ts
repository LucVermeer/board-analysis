import { pgTable, bigserial, bigint, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Type-only import: the layout shape lives in @boardsesh/kiosk, the single source
// of truth shared by the backend write validator and the web renderer. This
// import is erased at compile time, so it never becomes a runtime dependency of
// the generated drizzle output (mirrors sessions.ts's ClimbQueueItem $type import).
import type { KioskLayout } from '@boardsesh/kiosk';
import { gyms } from './gyms';

/**
 * Gym kiosks — a configurable smart-TV dashboard for a gym. A gym can run several
 * (one per wall/screen), addressed publicly as `/kiosk/{gym-slug}/{kiosk-slug}`.
 * The `layout` jsonb holds the preset config — 1–4 board slots plus an optional
 * leaderboard rail — validated with `KioskLayoutSchema` from @boardsesh/kiosk on
 * every write.
 */
export const gymKiosks = pgTable(
  'gym_kiosks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    uuid: text('uuid').notNull().unique(),
    gymId: bigint('gym_id', { mode: 'number' })
      .references(() => gyms.id, { onDelete: 'cascade' })
      .notNull(),
    // URL-safe slug ({gym-slug}/{kiosk-slug}). Format (lowercase, no spaces or
    // slashes) is enforced at write time by the create/updateGymKiosk resolver
    // (PR 3) via @boardsesh/kiosk, not at the DB level — the column stays plain
    // text so a soft-deleted row can free an oddly-shaped legacy slug.
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // Preset config: 1–4 board slots + optional leaderboard rail. Shape is owned
    // by @boardsesh/kiosk (KioskLayoutSchema); reads go through
    // parseKioskLayoutLenient so older clients repair unknown layouts.
    // The default is hardcoded to version 1 rather than importing
    // KIOSK_LAYOUT_VERSION: the import above is type-only, and a value import
    // would pull @boardsesh/kiosk (TS `main`) into the compiled drizzle output,
    // breaking `drizzle-kit generate` (it loads dist as JS). A layout-version
    // bump is a documented hard cutover and must update this literal in lockstep.
    //
    // `showInstallQr` (an additive, optional field) is deliberately omitted from
    // this literal: the lenient reader defaults an absent value to false, so a
    // row created from this column default reads correctly without carrying the
    // key — and keeping the literal byte-identical means the additive field
    // needs no column-default migration. New kiosks are inserted with
    // emptyKioskLayout() (which sets it) by the resolver regardless. The cast
    // reconciles the intentionally-partial literal with the full KioskLayout type.
    layout: jsonb('layout')
      .$type<KioskLayout>()
      .default({ version: 1, boards: [], leaderboard: null } as unknown as KioskLayout)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    // One live kiosk per (gym, slug); soft-deleted rows free the slug for reuse.
    uniqueGymSlugIdx: uniqueIndex('gym_kiosks_unique_gym_slug')
      .on(table.gymId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    gymIdx: index('gym_kiosks_gym_idx')
      .on(table.gymId)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

// Type exports
export type GymKiosk = typeof gymKiosks.$inferSelect;
export type NewGymKiosk = typeof gymKiosks.$inferInsert;
