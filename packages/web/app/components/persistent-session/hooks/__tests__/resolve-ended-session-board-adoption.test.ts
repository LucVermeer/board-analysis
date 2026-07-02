import { describe, expect, it } from 'vite-plus/test';
import { resolveEndedSessionBoardAdoption } from '../use-queue-storage';
import type { ActiveSessionInfo } from '../../types';
import type { BoardDetails } from '@/app/lib/types';

const boardA = { layout_name: 'Board A' } as unknown as BoardDetails;
const boardB = { layout_name: 'Board B' } as unknown as BoardDetails;

function session(boardPath: string, boardDetails: BoardDetails): ActiveSessionInfo {
  return {
    sessionId: `sess-${boardPath}`,
    boardPath,
    boardDetails,
    // Only boardPath/boardDetails are read by the predicate; the rest is stubbed.
    parsedParams: {} as unknown as ActiveSessionInfo['parsedParams'],
  };
}

describe('resolveEndedSessionBoardAdoption', () => {
  it('adopts the ended session board on a party-end transition (session → null)', () => {
    const ended = session('/kilter/1/1/default/40', boardB);
    expect(resolveEndedSessionBoardAdoption(ended, null)).toEqual({
      boardPath: '/kilter/1/1/default/40',
      boardDetails: boardB,
    });
  });

  it('does not adopt on activation (null → session)', () => {
    expect(resolveEndedSessionBoardAdoption(null, session('/kilter/1/1/default/40', boardB))).toBeNull();
  });

  it('does not adopt on a session → session swap', () => {
    const a = session('/kilter/1/1/default/40', boardA);
    const b = session('/tension/2/2/default/40', boardB);
    expect(resolveEndedSessionBoardAdoption(a, b)).toBeNull();
  });

  it('does not adopt on a no-op (null → null)', () => {
    expect(resolveEndedSessionBoardAdoption(null, null)).toBeNull();
  });

  it('does not adopt when the ended session carried no board', () => {
    const noBoard = { sessionId: 'x', boardPath: '', boardDetails: undefined } as unknown as ActiveSessionInfo;
    expect(resolveEndedSessionBoardAdoption(noBoard, null)).toBeNull();
  });
});
