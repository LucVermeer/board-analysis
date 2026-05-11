const MAX_LENGTH = 2000;

const POSTGRES_FIELDS = [
  ['code', 'code'],
  ['severity', 'severity'],
  ['constraint_name', 'constraint'],
  ['table_name', 'table'],
  ['column_name', 'column'],
  ['schema_name', 'schema'],
] as const;

type ErrorWithCause = { cause?: unknown };

function looksLikePostgresError(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.severity === 'string';
}

function pickPostgresError(error: unknown): Record<string, unknown> | null {
  if (looksLikePostgresError(error)) return error;
  const cause = (error as ErrorWithCause)?.cause;
  if (looksLikePostgresError(cause)) return cause;
  return null;
}

function truncate(value: string): string {
  return value.length <= MAX_LENGTH ? value : `${value.slice(0, MAX_LENGTH - 1)}…`;
}

export function formatDbError(error: unknown): string {
  const pgError = pickPostgresError(error);

  if (!pgError) {
    if (error instanceof Error) return truncate(error.message);
    return truncate(String(error));
  }

  const tags = POSTGRES_FIELDS.flatMap(([field, label]) => {
    const value = pgError[field];
    return typeof value === 'string' && value.length > 0 ? [`${label}=${value}`] : [];
  });

  const parts: string[] = [];
  if (tags.length > 0) parts.push(`Database error [${tags.join(' ')}]`);
  else parts.push('Database error');

  const detail = pgError.detail;
  if (typeof detail === 'string' && detail.length > 0) parts.push(`detail=${detail}`);

  const hint = pgError.hint;
  if (typeof hint === 'string' && hint.length > 0) parts.push(`hint=${hint}`);

  const message = pgError.message;
  if (typeof message === 'string' && message.length > 0) parts.push(`message=${message}`);

  return truncate(parts.join(': '));
}
