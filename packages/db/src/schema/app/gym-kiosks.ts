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
 * The `layout` jsonb holds the widget grid, validated with `KioskLayoutSchema`
 * from @boardsesh/kiosk on every write.
 */
export const gymKiosks = pgTable(
  'gym_kiosks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    uuid: text('uuid').notNull().unique(),
    gymId: bigint('gym_id', { mode: 'number' })
      .references(() => gyms.id, { onDelete: 'cascade' })
      .notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // Widget grid. Shape is owned by @boardsesh/kiosk (KioskLayoutSchema); reads
    // go through parseKioskLayoutLenient so older clients drop unknown widgets.
    layout: jsonb('layout').$type<KioskLayout>().default({ version: 1, widgets: [] }).notNull(),
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
