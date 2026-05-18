import type { SessionUser } from '@boardsesh/shared-schema';
import type { SessionUser as GeneratedSessionUser } from '@boardsesh/shared-schema/generated';

type UuidItem = {
  uuid: string;
};

/**
 * Normalize a SessionUser coming off the wire (generated GraphQL type, where
 * nullable fields are `Maybe<T>` = `T | null | undefined`) into the local
 * SessionUser shape (where `avatarUrl?: string` and `userId?: string | null`).
 * Used by reducers that ingest subscription events.
 */
export function coerceSessionUser(user: GeneratedSessionUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    isLeader: user.isLeader,
    avatarUrl: user.avatarUrl ?? undefined,
    userId: user.userId ?? null,
    connectionState: user.connectionState,
  };
}

export function upsertSessionUser(users: SessionUser[], user: SessionUser): SessionUser[] {
  const existingIndex = users.findIndex((existingUser) => existingUser.id === user.id);
  if (existingIndex === -1) {
    return [...users, user];
  }

  const nextUsers = [...users];
  nextUsers[existingIndex] = {
    ...nextUsers[existingIndex],
    ...user,
  };
  return nextUsers;
}

export function insertQueueItemIdempotent<T extends UuidItem>(queue: T[], item: T, position?: number): T[] {
  if (queue.some((existingItem) => existingItem.uuid === item.uuid)) {
    return queue;
  }

  const nextQueue = [...queue];
  if (position !== undefined && position >= 0 && position <= nextQueue.length) {
    nextQueue.splice(position, 0, item);
    return nextQueue;
  }

  nextQueue.push(item);
  return nextQueue;
}

export type QueueSequenceDecision = 'apply' | 'ignore-stale' | 'gap';

export function evaluateQueueEventSequence(lastSequence: number | null, eventSequence: number): QueueSequenceDecision {
  if (lastSequence === null) {
    return 'apply';
  }

  if (eventSequence <= lastSequence) {
    return 'ignore-stale';
  }

  if (eventSequence > lastSequence + 1) {
    return 'gap';
  }

  return 'apply';
}
