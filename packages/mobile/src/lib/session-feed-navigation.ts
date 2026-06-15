import { type useRouter } from 'expo-router';
import type { SessionFeedItem } from '@boardsesh/shared-schema';

type Router = ReturnType<typeof useRouter>;

export function navigateToSessionFeedItem(router: Router, session: SessionFeedItem): void {
  router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.sessionId } });
}
