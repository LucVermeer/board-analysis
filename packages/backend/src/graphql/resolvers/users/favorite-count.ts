import { sql } from 'drizzle-orm';
import * as dbSchema from '@boardsesh/db/schema';

// Correlated subquery for UserProfile.favoriteCount — shared by the `profile`
// query and `updateProfile` mutation so both stay a single round trip instead
// of a separate count() query, without duplicating the SQL between them.
// Raw sql() rather than the query builder: a correlated "count from another
// table per row" can't be expressed as a join here without a GROUP BY, which
// would require restructuring both callers' single-row selects.
export const FAVORITE_COUNT_SUBQUERY = sql<number>`(select count(*)::int from ${dbSchema.userFavorites} where ${dbSchema.userFavorites.userId} = ${dbSchema.users.id})`;
