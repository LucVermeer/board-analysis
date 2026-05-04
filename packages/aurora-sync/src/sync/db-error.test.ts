import { describe, expect, it } from 'vitest';
import { formatDbError } from './db-error';

function makePostgresError(fields: Record<string, string>): Error {
  const err = new Error(fields.message ?? 'pg error');
  Object.assign(err, fields);
  return err;
}

function makeDrizzleQueryError(query: string, params: unknown[], cause: Error): Error {
  const err = new Error(`Failed query: ${query}\nparams: ${params.join(',')}`);
  Object.assign(err, { query, params, cause });
  return err;
}

describe('formatDbError', () => {
  it('returns message for a plain Error with no cause', () => {
    expect(formatDbError(new Error('something broke'))).toBe('something broke');
  });

  it('stringifies non-Error throws', () => {
    expect(formatDbError('boom')).toBe('boom');
    expect(formatDbError(42)).toBe('42');
    expect(formatDbError(undefined)).toBe('undefined');
  });

  it('extracts PostgresError fields from a DrizzleQueryError cause', () => {
    const cause = makePostgresError({
      code: '23503',
      severity: 'ERROR',
      constraint_name: 'board_walls_layout_fk',
      table_name: 'board_walls',
      column_name: 'layout_id',
      schema_name: 'public',
      detail: 'Key (board_type, layout_id)=(tension, 10) is not present in table "board_layouts".',
      hint: 'Make sure the layout exists.',
      message: 'insert or update on table "board_walls" violates foreign key constraint "board_walls_layout_fk"',
    });
    const wrapped = makeDrizzleQueryError('insert into "board_walls" ...', ['tension', 10], cause);

    const formatted = formatDbError(wrapped);

    expect(formatted).toContain('code=23503');
    expect(formatted).toContain('severity=ERROR');
    expect(formatted).toContain('constraint=board_walls_layout_fk');
    expect(formatted).toContain('table=board_walls');
    expect(formatted).toContain('column=layout_id');
    expect(formatted).toContain('schema=public');
    expect(formatted).toContain(
      'detail=Key (board_type, layout_id)=(tension, 10) is not present in table "board_layouts".',
    );
    expect(formatted).toContain('hint=Make sure the layout exists.');
    expect(formatted).toContain('message=insert or update on table "board_walls"');
    // Drizzle wrapper noise should NOT leak through
    expect(formatted).not.toContain('Failed query:');
  });

  it('extracts fields when the PostgresError is the top-level error', () => {
    const direct = makePostgresError({
      code: '23505',
      severity: 'ERROR',
      constraint_name: 'board_users_pkey',
      table_name: 'board_users',
      detail: 'Key (board_type, id)=(kilter, 1) already exists.',
      message: 'duplicate key value violates unique constraint "board_users_pkey"',
    });

    const formatted = formatDbError(direct);

    expect(formatted).toContain('code=23505');
    expect(formatted).toContain('constraint=board_users_pkey');
    expect(formatted).toContain('table=board_users');
    expect(formatted).toContain('detail=Key (board_type, id)=(kilter, 1) already exists.');
  });

  it('caps output length at ~2000 chars even with a huge detail field', () => {
    const cause = makePostgresError({
      code: '23503',
      severity: 'ERROR',
      detail: 'x'.repeat(5000),
      message: 'huge detail',
    });

    const formatted = formatDbError(cause);

    expect(formatted.length).toBeLessThanOrEqual(2000);
    // truncation marker
    expect(formatted.endsWith('…')).toBe(true);
  });
});
