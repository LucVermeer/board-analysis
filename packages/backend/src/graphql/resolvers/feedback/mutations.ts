import type { ConnectionContext, FeedbackContextInput } from '@boardsesh/shared-schema';
import { eq } from 'drizzle-orm';
import { sendBugReportIssueEmail } from '@boardsesh/email';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import type { FeedbackContext } from '@boardsesh/db/schema';
import { applyRateLimit, validateInput } from '../shared/helpers';
import { SubmitAppFeedbackInputSchema } from '../../../validation/schemas';
import { createFeedbackGithubIssue } from '../../../services/github-feedback';
import { logger } from '../../../utils/logger';

export const feedbackMutations = {
  submitAppFeedback: async (_: unknown, { input }: { input: unknown }, ctx: ConnectionContext): Promise<boolean> => {
    await applyRateLimit(ctx, 10, 'submitAppFeedback');

    const validated = validateInput(SubmitAppFeedbackInputSchema, input, 'input');
    const comment = validated.comment?.trim() ? validated.comment.trim() : null;
    const appVersion = validated.appVersion ?? null;
    const rating = validated.rating ?? null;
    const boardName = validated.boardName ?? null;
    const layoutId = validated.layoutId ?? null;
    const sizeId = validated.sizeId ?? null;
    const setIds = validated.setIds ?? null;
    const angle = validated.angle ?? null;
    const contactConsent = validated.contactConsent ?? null;
    const context = normalizeContext(validated.context);
    const userId = ctx.userId ?? null;

    const rows = await db
      .insert(dbSchema.appFeedback)
      .values({
        userId,
        rating,
        comment,
        platform: validated.platform,
        appVersion,
        source: validated.source,
        boardName,
        layoutId,
        sizeId,
        setIds,
        angle,
        contactConsent,
        context,
      })
      .returning();
    const row = rows[0];

    // Fire-and-forget side effect for bug reports: open a GitHub issue, then —
    // if the reporter opted in to contact and is signed in — email them the
    // link. Bug-vs-rating gating lives in createFeedbackGithubIssue (rating
    // sources return null and no email is sent). Errors are logged and never
    // bubble up; this must not block or fail the mutation. Guard on row
    // existence — a missing returned row means a DB-layer problem, not our
    // contract, so skip the side effect.
    if (row) {
      void (async () => {
        try {
          const issue = await createFeedbackGithubIssue({
            feedbackId: row.id,
            rating,
            comment,
            platform: validated.platform,
            appVersion,
            source: validated.source,
            boardName,
            layoutId,
            sizeId,
            setIds,
            angle,
            context,
            contactConsent,
          });

          if (issue && contactConsent && userId) {
            const [reporter] = await db
              .select({ email: dbSchema.users.email })
              .from(dbSchema.users)
              .where(eq(dbSchema.users.id, userId))
              .limit(1);
            if (reporter?.email) {
              await sendBugReportIssueEmail({
                to: reporter.email,
                issueUrl: issue.htmlUrl,
                issueNumber: issue.number,
              });
            }
          }
        } catch (error) {
          logger.error('[feedback] issue/email side-effect failed:', error);
        }
      })();
    }

    return true;
  },
};

// Drop null/undefined leaves and return null when the result is empty so we
// don't write `{}` rows that look like "context was provided but blank". The
// stored shape uses `string | undefined` (no nulls) — narrower than the
// nullable input type — so we return `FeedbackContext` to match the column.
function normalizeContext(input: FeedbackContextInput | null | undefined): FeedbackContext | null {
  if (!input) return null;
  const out: FeedbackContext = {};
  for (const [k, v] of Object.entries(input) as Array<[keyof FeedbackContext, unknown]>) {
    if (typeof v === 'string' && v.length > 0) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
