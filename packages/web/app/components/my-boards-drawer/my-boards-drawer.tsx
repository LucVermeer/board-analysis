'use client';

import React, { useState, useCallback } from 'react';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import SwipeableDrawer from '../swipeable-drawer/swipeable-drawer';
import { BoardDetailContent, type BoardDetailEditHost } from '../board-entity/board-detail';
import BoardSearchResults from '../social/board-search-results';
import { FormActions } from '@/app/components/form';
import { useMyBoards } from '@/app/hooks/use-my-boards';
import { useInfiniteScroll } from '@/app/hooks/use-infinite-scroll';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import styles from './my-boards-drawer.module.css';

type DrawerView =
  | { type: 'list' }
  | { type: 'search' }
  | { type: 'board-detail'; boardUuid: string; from: 'list' | 'search'; isFollowedByMe?: boolean };

type MyBoardsDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreateBoard?: () => void;
  onTransitionEnd?: (open: boolean) => void;
};

export default function MyBoardsDrawer({ open, onClose, onCreateBoard, onTransitionEnd }: MyBoardsDrawerProps) {
  const { t } = useTranslation('common');
  const { boards, isLoading, isFetchingMore, hasMore, loadMore, error } = useMyBoards(open);
  const { sentinelRef } = useInfiniteScroll({ onLoadMore: loadMore, hasMore, isFetching: isFetchingMore });
  const { token } = useWsAuthToken();
  const [view, setView] = useState<DrawerView>({ type: 'list' });
  const [searchQuery, setSearchQuery] = useState('');
  // Set while the board-detail view is in edit mode: the drawer header hosts
  // the "Edit Board" title + Save/Cancel actions (bottom-drawer ruling), and
  // the board-detail form drops its own title so it isn't doubled.
  const [editHost, setEditHost] = useState<BoardDetailEditHost | null>(null);

  const handleBack = useCallback(() => {
    if (view.type === 'board-detail') {
      setView(view.from === 'search' ? { type: 'search' } : { type: 'list' });
    } else if (view.type === 'search') {
      setView({ type: 'list' });
      setSearchQuery('');
    }
  }, [view]);

  const handleClose = useCallback(() => {
    onClose();
    setView({ type: 'list' });
    setSearchQuery('');
  }, [onClose]);

  const handleBoardClick = useCallback((board: UserBoard) => {
    setView({
      type: 'board-detail',
      boardUuid: board.uuid,
      from: 'list',
      isFollowedByMe: board.isFollowedByMe,
    });
  }, []);

  const handleSearchBoardSelect = useCallback((board: UserBoard) => {
    setView({
      type: 'board-detail',
      boardUuid: board.uuid,
      from: 'search',
      isFollowedByMe: board.isFollowedByMe,
    });
  }, []);

  const handleBoardDeleted = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  const formatBoardMeta = (board: UserBoard) => {
    const parts: string[] = [];
    parts.push(board.boardType.charAt(0).toUpperCase() + board.boardType.slice(1));
    if (board.locationName) parts.push(board.locationName);
    if (board.angle != null) parts.push(`${board.angle}\u00B0`);
    return parts.join(' \u00B7 ');
  };

  // Only honour the edit host while the board-detail view is actually mounted —
  // guards against a stale descriptor if BoardDetailContent hasn't cleared yet.
  const activeEditHost = view.type === 'board-detail' ? editHost : null;

  const drawerTitle = activeEditHost ? (
    activeEditHost.title
  ) : view.type === 'list' ? (
    t('myBoards.title')
  ) : (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton size="small" onClick={handleBack} edge="start" aria-label={t('ariaLabels.back')}>
        <ArrowBackOutlined fontSize="small" />
      </IconButton>
      {view.type === 'search' ? t('myBoards.findBoard') : t('myBoards.boardDetail')}
    </Box>
  );

  const headerExtra = activeEditHost ? (
    <FormActions
      formId={activeEditHost.formId}
      submitLabel={activeEditHost.submit.submitLabel}
      submitting={activeEditHost.submit.submitting}
      disabled={!activeEditHost.submit.canSubmit}
      onCancel={activeEditHost.onCancel}
      layout="row"
    />
  ) : view.type === 'list' ? (
    <>
      <IconButton size="small" onClick={() => setView({ type: 'search' })} aria-label={t('myBoards.ariaFindBoard')}>
        <SearchOutlined fontSize="small" />
      </IconButton>
      {onCreateBoard && (
        <IconButton size="small" onClick={onCreateBoard} aria-label={t('myBoards.ariaCreateBoard')}>
          <AddOutlined fontSize="small" />
        </IconButton>
      )}
    </>
  ) : null;

  const renderListContent = () => {
    if (error && boards.length === 0) {
      return (
        <div className={styles.emptyState} data-testid="my-boards-error">
          <Alert severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </div>
      );
    }
    if (isLoading && boards.length === 0) {
      return (
        <div className={styles.loadingState} data-testid="my-boards-loading">
          <CircularProgress size={32} />
        </div>
      );
    }
    if (boards.length === 0) {
      return (
        <div className={styles.emptyState} data-testid="my-boards-empty">
          <DashboardOutlined sx={{ fontSize: 48, color: 'var(--neutral-300)' }} />
          <Typography variant="body2" color="text.secondary">
            {t('myBoards.empty')}
          </Typography>
        </div>
      );
    }
    return (
      <div className={styles.boardList} data-testid="my-boards-list">
        {boards.map((board) => (
          <button
            type="button"
            key={board.uuid}
            className={styles.boardItem}
            onClick={() => handleBoardClick(board)}
            data-testid={`board-item-${board.uuid}`}
          >
            <div className={styles.boardItemIcon}>
              <DashboardOutlined />
            </div>
            <div className={styles.boardItemInfo}>
              <div className={styles.boardItemName}>{board.name}</div>
              <div className={styles.boardItemMeta}>{formatBoardMeta(board)}</div>
            </div>
            <ChevronRightOutlined className={styles.boardItemAction} />
          </button>
        ))}
        <div ref={sentinelRef} />
        {isFetchingMore && (
          <div className={styles.loadingMore}>
            <CircularProgress size={20} />
          </div>
        )}
      </div>
    );
  };

  return (
    <SwipeableDrawer
      title={drawerTitle}
      placement="bottom"
      open={open}
      onClose={handleClose}
      onTransitionEnd={onTransitionEnd}
      height="100%"
      fullHeight
      extra={headerExtra}
      styles={{ body: { padding: 0 } }}
    >
      {view.type === 'list' && renderListContent()}

      {view.type === 'search' && (
        <>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder={t('myBoards.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ px: 2, pt: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <BoardSearchResults
            query={searchQuery}
            authToken={token}
            showFollowButton
            onBoardSelect={handleSearchBoardSelect}
          />
        </>
      )}

      {view.type === 'board-detail' && (
        <BoardDetailContent
          boardUuid={view.boardUuid}
          initialIsFollowing={view.isFollowedByMe}
          onDeleted={handleBoardDeleted}
          onEditHostChange={setEditHost}
        />
      )}
    </SwipeableDrawer>
  );
}
