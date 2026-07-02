import { relations } from 'drizzle-orm/relations';
import { boardSessions, boardSessionQueues } from '../schema/app/sessions';
import { users } from '../schema/auth/users';

export const boardSessionsRelations = relations(boardSessions, ({ one }) => ({
  createdByUser: one(users, {
    fields: [boardSessions.createdByUserId],
    references: [users.id],
  }),
  queue: one(boardSessionQueues, {
    fields: [boardSessions.id],
    references: [boardSessionQueues.sessionId],
  }),
}));

export const boardSessionQueuesRelations = relations(boardSessionQueues, ({ one }) => ({
  session: one(boardSessions, {
    fields: [boardSessionQueues.sessionId],
    references: [boardSessions.id],
  }),
}));
