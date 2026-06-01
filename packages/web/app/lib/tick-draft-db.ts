import { createIndexedDBStore } from './idb-helper';
import type { TickStatus } from '@boardsesh/board-react';

const STORE_NAME = 'tick-drafts';

export type TickDraft = {
  climbUuid: string;
  angle: number;
  quality: number | null;
  difficulty: number | undefined;
  attemptCount: number;
  comment: string;
  status: TickStatus;
  videoUrl?: string;
};

function draftKey(climbUuid: string, angle: number): string {
  return `${climbUuid}:${angle}`;
}

const getDB = createIndexedDBStore('boardsesh-tick-drafts', STORE_NAME);

export async function saveTickDraft(draft: TickDraft): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    await db.put(STORE_NAME, draft, draftKey(draft.climbUuid, draft.angle));
  } catch {
    // Best-effort — don't block the UI
  }
}

export async function loadTickDraft(climbUuid: string, angle: number): Promise<TickDraft | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    const data = (await db.get(STORE_NAME, draftKey(climbUuid, angle))) as TickDraft | undefined;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function clearTickDraft(climbUuid: string, angle: number): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    await db.delete(STORE_NAME, draftKey(climbUuid, angle));
  } catch {
    // Silently ignore
  }
}
