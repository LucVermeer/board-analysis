/**
 * Recursively stitch drizzle's `queryChunks` AST back into raw SQL text, for
 * test assertions over composed statements. Nested `sql`…`` fragments (e.g. the
 * blendedQualityAverageSql() interpolation) are themselves chunk objects with
 * their own `queryChunks`, so the walk must recurse to see their text — a flat
 * pass over the top level would miss every nested fragment. Parameter
 * sentinels are dropped: the result is the raw SQL text only, which is what
 * substring/regex assertions need.
 *
 * Test-only helper (exported as `@boardsesh/db/test-utils`) — do not import
 * from production code.
 */
export function sqlText(query: unknown): string {
  if (query === null || typeof query !== 'object') return '';
  const chunk = query as { value?: string[]; queryChunks?: unknown[] };
  if (Array.isArray(chunk.value)) return chunk.value.join('');
  if (Array.isArray(chunk.queryChunks)) return chunk.queryChunks.map(sqlText).join('');
  return '';
}
