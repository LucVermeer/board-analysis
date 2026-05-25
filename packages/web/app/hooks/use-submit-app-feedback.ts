'use client';

import { useMutation } from '@tanstack/react-query';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  SUBMIT_APP_FEEDBACK,
  type SubmitAppFeedbackMutationVariables,
  type SubmitAppFeedbackMutationResponse,
} from '@boardsesh/graphql/operations';
import type { SubmitAppFeedbackInput, FeedbackContextInput } from '@boardsesh/shared-schema';
import { getPlatform } from '@/app/lib/ble/capacitor-utils';
import { getAppVersion } from '@/app/lib/app-info';
import { useWsAuthToken } from './use-ws-auth-token';
import { useQueueBridgeBoardInfo } from '@/app/components/queue-control/queue-bridge-board-info-context';
import { usePersistentSession } from '@/app/components/persistent-session';
import type { Angle, BoardDetails } from '@/app/lib/types';
import type { ClimbQueueItem } from '@/app/components/queue-control/types';
import type { ActiveSessionInfo } from '@/app/components/persistent-session';

/**
 * Fields callers provide. `platform`/`appVersion` are injected by the helper;
 * board + queue + session context is injected by the React hook so call sites
 * never have to thread it through manually.
 */
export type SubmitAppFeedbackPayload = Omit<
  SubmitAppFeedbackInput,
  'platform' | 'appVersion' | 'boardName' | 'layoutId' | 'sizeId' | 'setIds' | 'angle' | 'context'
>;

const BOARD_NAME_MAX = 100;
const URL_MAX = 1000;
const UA_MAX = 512;

type FeedbackEnrichment = Pick<
  SubmitAppFeedbackInput,
  'boardName' | 'layoutId' | 'sizeId' | 'setIds' | 'angle' | 'context'
>;

export type BuildFeedbackEnrichmentArgs = {
  boardDetails: BoardDetails | null;
  angle: Angle;
  activeSession: Pick<ActiveSessionInfo, 'sessionId' | 'sessionName' | 'boardDetails'> | null;
  /** ps.currentClimbQueueItem — the climb selected in an active party session. */
  partyClimbQueueItem: ClimbQueueItem | null;
  /** ps.localCurrentClimbQueueItem — the climb selected locally, no party. */
  localClimbQueueItem: ClimbQueueItem | null;
  /** Typically `window.location.pathname + window.location.search`. */
  url: string | undefined;
  /** Typically `navigator.userAgent`. */
  userAgent: string | undefined;
};

/**
 * Trim a string to `max` chars, treating empty/whitespace-only as absent.
 * Exported for tests.
 */
export function clip(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Clip a board identifier to {@link BOARD_NAME_MAX} chars; returns null when
 * the value is missing/empty so the resolver can store NULL rather than ''.
 * Exported for tests.
 */
export function clipBoardName(name: string | null | undefined): string | null {
  return clip(name, BOARD_NAME_MAX) ?? null;
}

/**
 * Drop empty/null leaves and return null when nothing remains, so we don't
 * send `{}` over the wire (looks like "context provided but blank").
 * Exported for tests.
 */
export function compactContext(input: FeedbackContextInput): FeedbackContextInput | null {
  const out: FeedbackContextInput = {};
  for (const [key, value] of Object.entries(input) as Array<[keyof FeedbackContextInput, unknown]>) {
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Pure derivation of the board + queue + session enrichment that gets attached
 * to a feedback submission. Kept separate from the React hook so it can be
 * tested without rendering. Selection rules:
 *
 * - When a party session is active, prefer its board and current climb (mirrors
 *   `sesh-settings-drawer`).
 * - Otherwise fall back to the bridge board and the local current climb.
 * - When no board is available at all, all board fields are null and `angle`
 *   is null too — `angle` only makes sense alongside a board.
 *
 * Exported for tests.
 */
export function buildFeedbackEnrichment(args: BuildFeedbackEnrichmentArgs): FeedbackEnrichment {
  const board = args.activeSession?.boardDetails ?? args.boardDetails;
  const climb = (args.activeSession ? args.partyClimbQueueItem : args.localClimbQueueItem)?.climb;

  return {
    boardName: clipBoardName(board?.board_name),
    layoutId: board?.layout_id ?? null,
    sizeId: board?.size_id ?? null,
    setIds: board?.set_ids ?? null,
    angle: board ? args.angle : null,
    context: compactContext({
      climbUuid: climb?.uuid,
      climbName: climb?.name,
      difficulty: climb?.difficulty ?? undefined,
      sessionId: args.activeSession?.sessionId,
      sessionName: args.activeSession?.sessionName,
      url: clip(args.url, URL_MAX),
      userAgent: clip(args.userAgent, UA_MAX),
    }),
  };
}

/**
 * Stateless submit helper. Use this when you don't have access to a
 * QueryClientProvider (e.g. a handler on a rarely-rendered button) and
 * want to fire the mutation directly. Auth token is optional — when
 * omitted, the submission is anonymous. Board/queue context is NOT
 * injected here — pass it via `payload` or use the React hook.
 */
export async function submitAppFeedback(
  payload: SubmitAppFeedbackPayload &
    Partial<Pick<SubmitAppFeedbackInput, 'boardName' | 'layoutId' | 'sizeId' | 'setIds' | 'angle' | 'context'>>,
  token?: string | null,
): Promise<boolean> {
  const platform = getPlatform();
  const appVersion = await getAppVersion();
  const client = createGraphQLHttpClient(token ?? null);
  const variables: SubmitAppFeedbackMutationVariables = {
    input: { ...payload, platform, appVersion },
  };
  const response = await client.request<SubmitAppFeedbackMutationResponse>(SUBMIT_APP_FEEDBACK, variables);
  return response.submitAppFeedback;
}

/**
 * Fire-and-report submission of app feedback. The mutation is public; the
 * auth token is attached when available so the backend associates the
 * feedback with the user. The UI should close optimistically before awaiting
 * — an error surfaces a toast but does not reopen the prompt.
 *
 * Reads board, current-climb, and party-session state from the bridge/session
 * contexts at submission time so every caller (rating prompts, drawer
 * feedback, bug reports) gets enriched without threading props.
 */
export function useSubmitAppFeedback() {
  const { token } = useWsAuthToken();
  // We deliberately don't gate on `isHydrated` — the bridge defaults to
  // `boardDetails: null`, which the enrichment treats as "no board". A
  // submission made during the hydration window simply ships without board
  // metadata rather than blocking the user.
  const { boardDetails, angle } = useQueueBridgeBoardInfo();
  const ps = usePersistentSession();

  return useMutation({
    mutationFn: (payload: SubmitAppFeedbackPayload): Promise<boolean> => {
      const enrichment = buildFeedbackEnrichment({
        boardDetails,
        angle,
        activeSession: ps.activeSession,
        partyClimbQueueItem: ps.currentClimbQueueItem,
        localClimbQueueItem: ps.localCurrentClimbQueueItem,
        url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      return submitAppFeedback({ ...payload, ...enrichment }, token);
    },
  });
}
