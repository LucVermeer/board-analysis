import { describe, it, expect, vi } from 'vite-plus/test';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// sql-expressions.ts imports the db client at module load for its imperative
// helper (getConsensusDifficultyName). The factory under test uses none of it,
// so stub the client to keep this a pure render test with no DB dependency.
vi.mock('../db/client', () => ({ db: {}, dbRead: {} }));

import { boardseshGradeTickJoin } from '../graphql/resolvers/shared/sql-expressions';

const pgDialect = new PgDialect();
const render = (node: SQL) => pgDialect.sqlToQuery(node).sql;

describe('boardseshGradeTickJoin — single source of truth for the grade↔tick join', () => {
  it('emits the alias-resolved join for the Drizzle unaliased table names', () => {
    const rendered = render(
      boardseshGradeTickJoin({
        ticks: 'boardsesh_ticks',
        grades: 'board_climb_grades',
        aliases: 'board_climb_aliases',
      }),
    );
    // COALESCE(canonical_uuid, climb_uuid) = grades.climb_uuid resolution
    expect(rendered).toContain(
      'COALESCE(board_climb_aliases.canonical_uuid, boardsesh_ticks.climb_uuid) = board_climb_grades.climb_uuid',
    );
    // board-type equality
    expect(rendered).toContain('boardsesh_ticks.board_type = board_climb_grades.board_type');
    // angle equality
    expect(rendered).toContain('boardsesh_ticks.angle = board_climb_grades.angle');
    // Identifiers only — no bound params leak into a composable ON fragment.
    const { params } = pgDialect.sqlToQuery(
      boardseshGradeTickJoin({ ticks: 'boardsesh_ticks', grades: 'g', aliases: 'a' }),
    );
    expect(params).toEqual([]);
  });

  it('emits the same shape for the raw-SQL session-feed short aliases', () => {
    const rendered = render(boardseshGradeTickJoin({ ticks: 't', grades: 'bcg', aliases: 'bca' }));
    expect(rendered).toContain('COALESCE(bca.canonical_uuid, t.climb_uuid) = bcg.climb_uuid');
    expect(rendered).toContain('t.board_type = bcg.board_type');
    expect(rendered).toContain('t.angle = bcg.angle');
  });
});
