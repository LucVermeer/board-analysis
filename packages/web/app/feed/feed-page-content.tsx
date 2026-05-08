'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import ActivityFeed from '@/app/components/activity-feed/activity-feed';
import ProposalFeed from '@/app/components/activity-feed/proposal-feed';
import CommentFeed from '@/app/components/activity-feed/comment-feed';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';

import BoardFilterStrip from '@/app/components/board-scroll/board-filter-strip';
import type { SessionFeedResult, UserBoard } from '@boardsesh/shared-schema';
import { useMyBoards } from '@/app/hooks/use-my-boards';
import UnifiedSearchDrawer from '@/app/components/search-drawer/unified-search-drawer';

type FeedTab = 'sessions' | 'proposals' | 'comments';
const VALID_TABS: FeedTab[] = ['sessions', 'proposals', 'comments'];

type FeedPageContentProps = {
  initialTab?: FeedTab;
  initialBoardUuid?: string;
  initialFeedResult?: SessionFeedResult | null;
  isAuthenticatedSSR?: boolean;
  initialMyBoards?: UserBoard[] | null;
};

export default function FeedPageContent({
  initialTab = 'sessions',
  initialBoardUuid,
  initialFeedResult,
  isAuthenticatedSSR,
  initialMyBoards,
}: FeedPageContentProps) {
  const { t } = useTranslation('feed');
  const { status } = useSession();
  const router = useLocaleRouter();
  const searchParams = useSearchParams();

  // Trust the SSR hint during the loading phase to prevent flash of unauthenticated content
  let isAuthenticated: boolean;
  if (status === 'authenticated') {
    isAuthenticated = true;
  } else if (status === 'loading') {
    isAuthenticated = isAuthenticatedSSR ?? false;
  } else {
    isAuthenticated = false;
  }
  const { boards: myBoards, isLoading: isLoadingBoards } = useMyBoards(isAuthenticated, 50, initialMyBoards);

  // Read state from URL params (with fallbacks to server-provided initial values)
  const tabParam = searchParams.get('tab');
  const activeTab: FeedTab = VALID_TABS.includes(tabParam as FeedTab) ? (tabParam as FeedTab) : initialTab;
  const selectedBoardUuid = searchParams.get('board') || initialBoardUuid || null;
  const [findClimbersOpen, setFindClimbersOpen] = useState(false);

  // Helper: update a URL param via shallow navigation
  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      // Default tab is 'sessions', don't put in URL
      if (key === 'tab' && value === 'sessions') {
        params.delete(key);
      } else if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const qs = params.toString();
      router.push(qs ? `/feed?${qs}` : '/feed', { scroll: false });
    },
    [router, searchParams],
  );

  const handleTabChange = (_: React.SyntheticEvent, value: FeedTab) => {
    updateParam('tab', value);
  };

  const handleBoardSelect = useCallback(
    (board: UserBoard | null) => {
      updateParam('board', board?.uuid ?? null);
    },
    [updateParam],
  );

  const selectedBoard = useMemo(
    () => myBoards.find((b) => b.uuid === selectedBoardUuid) ?? null,
    [myBoards, selectedBoardUuid],
  );

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        pb: 'var(--bottom-bar-height)',
      }}
    >
      {/* Feed */}
      <Box component="main" sx={{ flex: 1, px: 2, py: 2, pt: 'calc(var(--global-header-height) + 16px)' }}>
        {isAuthenticated && (
          <BoardFilterStrip
            boards={myBoards}
            loading={isLoadingBoards}
            selectedBoard={selectedBoard}
            onBoardSelect={handleBoardSelect}
          />
        )}
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ mb: 2 }}
          aria-label={t('tabs.label')}
        >
          <Tab label={t('tabs.sessions')} value="sessions" />
          <Tab label={t('tabs.proposals')} value="proposals" />
          <Tab label={t('tabs.comments')} value="comments" />
        </Tabs>

        {activeTab === 'sessions' && (
          <ActivityFeed
            isAuthenticated={isAuthenticated}
            boardUuid={selectedBoardUuid}
            initialFeedResult={initialFeedResult}
            onFindClimbers={() => setFindClimbersOpen(true)}
          />
        )}

        {activeTab === 'proposals' && <ProposalFeed isAuthenticated={isAuthenticated} boardUuid={selectedBoardUuid} />}

        {activeTab === 'comments' && <CommentFeed isAuthenticated={isAuthenticated} boardUuid={selectedBoardUuid} />}
      </Box>

      <UnifiedSearchDrawer open={findClimbersOpen} onClose={() => setFindClimbersOpen(false)} defaultCategory="users" />
    </Box>
  );
}
