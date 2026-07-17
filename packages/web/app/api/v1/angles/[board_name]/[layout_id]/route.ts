import { NextResponse } from 'next/server';
import { isAuroraBoardName, AURORA_BOARD_NAMES } from '@/app/lib/board-constants';
import { ANGLES } from '@/app/lib/board-data';

export async function GET(req: Request, props: { params: Promise<{ board_name: string; layout_id: string }> }) {
  const params = await props.params;
  const { board_name } = params;

  if (!isAuroraBoardName(board_name)) {
    return NextResponse.json(
      { error: `Invalid board name: ${board_name}. Expected one of: ${AURORA_BOARD_NAMES.join(', ')}` },
      { status: 400 },
    );
  }

  // Aurora doesn't sync a per-layout angle table (deliberately excluded —
  // see packages/aurora-sync/src/sync/shared-sync.ts). Every layout for a
  // given board type supports the same fixed angle range, hardcoded in
  // ANGLES. Mirrors packages/backend/src/graphql/resolvers/board/queries.ts.
  const angles = ANGLES[board_name].map((angle) => ({ angle }));
  return NextResponse.json(angles);
}
