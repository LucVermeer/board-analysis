'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ChatBubbleOutlineOutlined from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ElectricBoltOutlined from '@mui/icons-material/ElectricBoltOutlined';
import InstagramIcon from '@mui/icons-material/Instagram';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import { AscentStatusIcon } from '@/app/components/ascent-status/ascent-status-icon';
import { ClimbActions } from '@/app/components/climb-actions';
import DrawerClimbHeader from '@/app/components/climb-card/drawer-climb-header';
import { PersonFallingIcon } from '@/app/components/icons/person-falling-icon';
import { InlineGradePicker, InlineStarPicker, InlineTriesPicker, type ExpandedControl } from '../logbook/tick-controls';
import { useDrawerDragResize } from '@/app/hooks/use-drawer-drag-resize';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { useIsDarkMode } from '@/app/hooks/use-is-dark-mode';
import { useUpdateTick } from '@/app/hooks/use-update-tick';
import { getGradesForBoard } from '@/app/lib/board-data';
import { getExcludedClimbActions } from '@/app/lib/climb-action-utils';
import { formatTickRelativeTime } from '@/app/lib/format-tick-time';
import { formatBoardDisplayName } from '@/app/lib/string-utils';
import type { BoardDetails, BoardName, Climb } from '@/app/lib/types';
import { themeTokens } from '@/app/theme/theme-config';
import { getLayoutDisplayName } from '@/app/profile/[user_id]/utils/profile-constants';
import type { AscentFeedItem } from '@boardsesh/graphql/operations/ticks';
import drawerCss from '@/app/components/swipeable-drawer/swipeable-drawer.module.css';
import styles from './logbook-feed-item.module.css';

const SwipeableDrawer = dynamic(() => import('../swipeable-drawer/swipeable-drawer'), {
  ssr: false,
});
const PostToInstagramDialog = dynamic(() => import('./post-to-instagram-dialog'), { ssr: false });
const AttachBetaLinkDialog = dynamic(() => import('@/app/components/beta-videos/attach-beta-link-dialog'), {
  ssr: false,
});

type TickStatus = AscentFeedItem['status'];
type LogbookGradeOption = ReturnType<typeof getGradesForBoard>[number];

const commentBoxSx = {
  fontSize: themeTokens.typography.fontSize.xs,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  color: 'text.primary',
  backgroundColor: 'var(--neutral-100)',
  borderRadius: `${themeTokens.borderRadius.sm}px`,
  padding: `${themeTokens.spacing[1]}px ${themeTokens.spacing[2]}px`,
  marginTop: `${themeTokens.spacing[1]}px`,
} as const;

const actionsDrawerStyles = {
  wrapper: {
    width: '100%',
    touchAction: 'pan-y' as const,
    transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  body: { padding: `${themeTokens.spacing[2]}px 0` },
  header: {
    paddingLeft: `${themeTokens.spacing[3]}px`,
    paddingRight: `${themeTokens.spacing[3]}px`,
  },
} as const;

function getBoardLabel(item: AscentFeedItem): string {
  if (item.layoutId == null) return formatBoardDisplayName(item.boardType);
  return getLayoutDisplayName(item.boardType, item.layoutId);
}

function LogbookGradeRow({
  consensusDifficultyName,
  qualityAverage,
  difficultyName,
  quality,
  editQuality,
  editDifficulty,
  editAttemptCount,
  expandedControl,
  onExpandControl,
  gradeButtonRef,
  triesButtonRef,
  grades,
}: {
  consensusDifficultyName: string | null;
  qualityAverage: number | null;
  difficultyName: string | null;
  quality: number | null;
  editQuality: number | null;
  editDifficulty: number | undefined;
  editAttemptCount: number;
  expandedControl: ExpandedControl;
  onExpandControl: (control: ExpandedControl) => void;
  gradeButtonRef: React.RefObject<HTMLButtonElement | null>;
  triesButtonRef: React.RefObject<HTMLButtonElement | null>;
  grades: readonly LogbookGradeOption[];
}) {
  const { t } = useTranslation('profile');
  const isDark = useIsDarkMode();
  const { formatGrade, getGradeColor } = useGradeFormat();

  const consensusFormatted = consensusDifficultyName ? formatGrade(consensusDifficultyName) : null;
  const consensusColor = consensusDifficultyName ? getGradeColor(consensusDifficultyName, isDark) : undefined;
  const consensusLabel = consensusFormatted ?? consensusDifficultyName ?? '\u2014';
  const consensusStarsLabel = qualityAverage != null ? Math.round(qualityAverage).toString() : '\u2014';

  const userFormatted = difficultyName ? formatGrade(difficultyName) : null;
  const userColor = difficultyName ? getGradeColor(difficultyName, isDark) : undefined;
  const userLabel = userFormatted ?? (difficultyName || '\u2014');

  const editGradeName = useMemo(() => {
    const grade = grades.find((gradeOption) => gradeOption.difficulty_id === editDifficulty);
    return grade?.difficulty_name;
  }, [editDifficulty, grades]);

  const editGradeFormatted = editGradeName ? formatGrade(editGradeName) : null;
  const editGradeColor = editGradeName ? getGradeColor(editGradeName, isDark) : undefined;
  const editGradeLabel = editGradeFormatted ?? (editGradeName || '\u2014');

  const handleToggle = useCallback(
    (control: ExpandedControl) => {
      onExpandControl(expandedControl === control ? null : control);
    },
    [onExpandControl, expandedControl],
  );

  return (
    <div className={styles.gradeRow}>
      <div className={`${styles.statCell} ${styles.dimmed}`}>
        <span className={styles.statValue} style={{ color: themeTokens.colors.amber }}>
          {`\u2605${consensusStarsLabel}`}
        </span>
        <span className={styles.statLabel}>{t('logbook.feed.stars')}</span>
      </div>
      <ButtonBase
        onClick={() => handleToggle('stars')}
        aria-label={t('logbook.feed.qualityAria', { value: editQuality ?? t('logbook.feed.none') })}
        className={styles.statCell}
        disableRipple={false}
      >
        <span className={styles.statValue} style={{ color: themeTokens.colors.amber }}>
          {`\u2605${editQuality ?? '\u2014'}`}
        </span>
        <span className={styles.statLabel}>{t('logbook.feed.user')}</span>
      </ButtonBase>
      <div className={`${styles.gradeCell} ${styles.dimmed}`}>
        <span className={styles.statValue} style={{ color: consensusColor }}>
          {consensusLabel}
        </span>
        <span className={styles.statLabel}>{t('logbook.feed.grade')}</span>
      </div>
      <ButtonBase
        ref={gradeButtonRef}
        onClick={() => handleToggle('grade')}
        aria-label={t('logbook.feed.selectGrade')}
        className={styles.gradeCell}
        disableRipple={false}
      >
        <span className={styles.statValue} style={{ color: editGradeColor ?? userColor }}>
          {editGradeLabel === '\u2014' ? userLabel : editGradeLabel}
        </span>
        <span className={styles.statLabel}>{t('logbook.feed.user')}</span>
      </ButtonBase>
      <ButtonBase
        ref={triesButtonRef}
        onClick={() => handleToggle('tries')}
        aria-label={t('logbook.feed.triesAria', { count: editAttemptCount })}
        className={styles.statCell}
        disableRipple={false}
      >
        <span className={styles.statValue}>{editAttemptCount}</span>
        <span className={styles.statLabel}>{t('logbook.feed.tries')}</span>
      </ButtonBase>
    </div>
  );
}

export function LogbookEntryMeta({ item }: { item: AscentFeedItem }) {
  const { t } = useTranslation('profile');
  const boardLabel = getBoardLabel(item);
  const details = [
    t('logbook.feed.triesCount', { count: item.attemptCount }),
    boardLabel,
    `${item.angle}\u00b0`,
    formatTickRelativeTime(item.climbedAt),
  ];

  return (
    <Box className={styles.metaRoot}>
      <Box className={styles.metaLine}>
        <AscentStatusIcon status={item.status} variant="badge" fontSize={12} />
        <Typography variant="caption" color="text.secondary" component="span" className={styles.metaText}>
          {details.join(' \u00b7 ')}
        </Typography>
      </Box>
      {item.comment && (
        <Typography variant="caption" component="div" sx={commentBoxSx}>
          {item.comment}
        </Typography>
      )}
    </Box>
  );
}

export function LogbookEntryEditor({ item, onCancelEdit }: { item: AscentFeedItem; onCancelEdit?: () => void }) {
  const { t } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { mutateAsync: updateTickAsync, isPending: isSaving } = useUpdateTick();
  const grades = useMemo(() => getGradesForBoard(item.boardType as BoardName), [item.boardType]);

  const [editStatus, setEditStatus] = useState<TickStatus>(item.status);
  const [editComment, setEditComment] = useState(item.comment);
  const [commentFocused, setCommentFocused] = useState(false);
  const [editQuality, setEditQuality] = useState<number | null>(item.quality ?? null);
  const [editDifficulty, setEditDifficulty] = useState<number | undefined>(item.difficulty ?? undefined);
  const [editAttemptCount, setEditAttemptCount] = useState(item.attemptCount);
  const [expandedControl, setExpandedControl] = useState<ExpandedControl>(null);
  const [lastExpandedControl, setLastExpandedControl] = useState<ExpandedControl>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [statusAnchorEl, setStatusAnchorEl] = useState<HTMLElement | null>(null);

  const gradeButtonRef = useRef<HTMLButtonElement>(null);
  const triesButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setEditStatus(item.status);
    setEditComment(item.comment);
    setCommentFocused(false);
    setEditQuality(item.quality ?? null);
    setEditDifficulty(item.difficulty ?? undefined);
    setEditAttemptCount(item.attemptCount);
    setExpandedControl(null);
    setLastExpandedControl(null);
    setPickerVisible(false);
    setStatusAnchorEl(null);
  }, [item]);

  useEffect(() => {
    if (expandedControl) {
      setLastExpandedControl(expandedControl);
      setPickerVisible(true);
      return;
    }

    const timer = window.setTimeout(() => setPickerVisible(false), 200);
    return () => window.clearTimeout(timer);
  }, [expandedControl]);

  const renderedControl = expandedControl ?? (pickerVisible ? lastExpandedControl : null);
  const focusGradeId = editDifficulty ?? item.consensusDifficulty ?? undefined;

  const handleStarSelect = useCallback((value: number | null) => {
    setEditQuality(value);
    setExpandedControl(null);
  }, []);

  const handleGradeSelect = useCallback((value: number | undefined) => {
    setEditDifficulty(value);
    setExpandedControl(null);
  }, []);

  const handleTriesSelect = useCallback((value: number) => {
    setEditAttemptCount(value);
    setExpandedControl(null);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await updateTickAsync({
        uuid: item.uuid,
        input: {
          status: editStatus,
          attemptCount: editAttemptCount,
          quality: editQuality ?? null,
          difficulty: editDifficulty ?? null,
          comment: editComment,
        },
      });
      onCancelEdit?.();
    } catch {
      // The mutation hook surfaces the error via snackbar; keep edit open.
    }
  }, [
    editStatus,
    editAttemptCount,
    editComment,
    editDifficulty,
    editQuality,
    item.uuid,
    onCancelEdit,
    updateTickAsync,
  ]);

  const handleStatusBadgeClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setStatusAnchorEl(event.currentTarget);
  }, []);

  const handleStatusSelect = useCallback((status: TickStatus) => {
    setEditStatus(status);
    setStatusAnchorEl(null);
  }, []);

  return (
    <Box className={styles.editorRoot} data-swipe-blocked="">
      <Box className={styles.editorTopRow}>
        <ButtonBase
          className={styles.editorStatusButton}
          onClick={handleStatusBadgeClick}
          aria-label={tProfile('logbook.feed.changeStatusAria', { status: editStatus })}
        >
          <AscentStatusIcon status={editStatus} variant="badge" fontSize={12} />
        </ButtonBase>
        <Box className={styles.editorMain}>
          <div className={`${styles.pickerPanel} ${expandedControl ? styles.pickerPanelExpanded : ''}`}>
            <div className={styles.pickerPanelContent}>
              {renderedControl === 'stars' && (
                <div className={styles.compactStarPicker}>
                  <InlineStarPicker quality={editQuality} onSelect={handleStarSelect} />
                </div>
              )}
              {renderedControl === 'grade' && (
                <InlineGradePicker
                  grades={grades}
                  currentGradeId={editDifficulty}
                  focusGradeId={focusGradeId}
                  onSelect={handleGradeSelect}
                  gradeButtonRef={gradeButtonRef}
                />
              )}
              {renderedControl === 'tries' && (
                <InlineTriesPicker
                  attemptCount={editAttemptCount}
                  onSelect={handleTriesSelect}
                  triesButtonRef={triesButtonRef}
                />
              )}
            </div>
          </div>
          <LogbookGradeRow
            consensusDifficultyName={item.consensusDifficultyName}
            qualityAverage={item.qualityAverage}
            difficultyName={item.difficultyName}
            quality={item.quality}
            editQuality={editQuality}
            editDifficulty={editDifficulty}
            editAttemptCount={editAttemptCount}
            expandedControl={expandedControl}
            onExpandControl={setExpandedControl}
            gradeButtonRef={gradeButtonRef}
            triesButtonRef={triesButtonRef}
            grades={grades}
          />
        </Box>
        <Box className={styles.editControls}>
          <IconButton
            size="small"
            onClick={() => onCancelEdit?.()}
            aria-label={tProfile('logbook.feed.cancelEditing')}
            sx={{
              width: 44,
              height: 44,
              color: 'text.disabled',
            }}
          >
            <CloseOutlined sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => void handleSave()}
            disabled={isSaving}
            aria-label={tProfile('logbook.feed.saveEdit')}
            sx={{
              width: 44,
              height: 44,
              backgroundColor: themeTokens.colors.success,
              color: 'common.white',
              '&:hover': { backgroundColor: themeTokens.colors.success },
            }}
          >
            {isSaving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlined sx={{ fontSize: 18 }} />}
          </IconButton>
        </Box>
      </Box>
      <Box className={styles.commentRow}>
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder={t('comment.shortPlaceholder')}
          multiline
          minRows={1}
          maxRows={commentFocused ? 4 : 1}
          value={editComment}
          onChange={(event) => setEditComment(event.target.value)}
          onFocus={() => {
            setExpandedControl(null);
            setCommentFocused(true);
          }}
          onBlur={() => setCommentFocused(false)}
          slotProps={{
            htmlInput: { maxLength: 2000, 'aria-label': tProfile('logbook.feed.editCommentAria') },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <ChatBubbleOutlineOutlined sx={{ fontSize: 16, opacity: 0.5 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: `${themeTokens.borderRadius.md}px`,
              backgroundColor: 'var(--input-bg)',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'var(--neutral-200)',
              },
            },
          }}
        />
      </Box>

      <Popover
        open={Boolean(statusAnchorEl)}
        anchorEl={statusAnchorEl}
        onClose={() => setStatusAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <MenuItem onClick={() => handleStatusSelect('flash')}>
          <ListItemIcon>
            <ElectricBoltOutlined sx={{ color: themeTokens.colors.amber }} />
          </ListItemIcon>
          <ListItemText>{tProfile('logbook.feed.status.flash')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleStatusSelect('send')}>
          <ListItemIcon>
            <CheckOutlined sx={{ color: themeTokens.colors.success }} />
          </ListItemIcon>
          <ListItemText>{tProfile('logbook.feed.status.send')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleStatusSelect('attempt')}>
          <ListItemIcon>
            <PersonFallingIcon sx={{ color: themeTokens.colors.error }} />
          </ListItemIcon>
          <ListItemText>{tProfile('logbook.feed.status.attempt')}</ListItemText>
        </MenuItem>
      </Popover>
    </Box>
  );
}

export function LogbookEntryMenu({
  item,
  climb,
  boardDetails,
  onEdit,
  onDelete,
  allowInstagramPosting,
  allowInstagramLinking,
}: {
  item: AscentFeedItem;
  climb: Climb;
  boardDetails: BoardDetails;
  onEdit?: (item: AscentFeedItem) => void;
  onDelete?: (uuid: string) => void;
  allowInstagramPosting?: boolean;
  allowInstagramLinking?: boolean;
}) {
  const { t } = useTranslation('profile');
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [instagramDialogOpen, setInstagramDialogOpen] = useState(false);
  const [betaLinkDialogOpen, setBetaLinkDialogOpen] = useState(false);

  const excludeActions = useMemo(
    () => getExcludedClimbActions(boardDetails.board_name, 'list'),
    [boardDetails.board_name],
  );

  const handleCloseActions = useCallback(() => setIsActionsOpen(false), []);
  const { paperRef: actionsPaperRef, dragHandlers: actionsDragHandlers } = useDrawerDragResize({
    open: isActionsOpen,
    onClose: handleCloseActions,
  });

  return (
    <>
      <IconButton
        size="small"
        aria-label={t('logbook.feed.moreActions')}
        onClick={(event) => {
          event.stopPropagation();
          setIsActionsOpen(true);
        }}
        className={styles.menuButton}
        disableRipple
      >
        <MoreHorizOutlined />
      </IconButton>

      <SwipeableDrawer
        title={
          <div data-swipe-blocked="" {...actionsDragHandlers} className={drawerCss.dragHeaderWrapper}>
            <DrawerClimbHeader climb={climb} boardDetails={boardDetails} />
          </div>
        }
        placement="bottom"
        height="60%"
        paperRef={actionsPaperRef}
        open={isActionsOpen}
        onClose={handleCloseActions}
        swipeEnabled={false}
        styles={actionsDrawerStyles}
      >
        {onEdit && (
          <MenuItem
            onClick={() => {
              handleCloseActions();
              onEdit(item);
            }}
          >
            <ListItemIcon>
              <EditOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('logbook.feed.editLog')}</ListItemText>
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem
            onClick={() => {
              handleCloseActions();
              onDelete(item.uuid);
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon>
              <DeleteOutlined sx={{ color: 'error.main' }} fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('logbook.feed.deleteLog')}</ListItemText>
          </MenuItem>
        )}
        {allowInstagramPosting && (
          <MenuItem
            onClick={() => {
              handleCloseActions();
              setInstagramDialogOpen(true);
            }}
          >
            <ListItemIcon>
              <InstagramIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('logbook.feed.postToInstagram')}</ListItemText>
          </MenuItem>
        )}
        {allowInstagramLinking && (
          <MenuItem
            onClick={() => {
              handleCloseActions();
              setBetaLinkDialogOpen(true);
            }}
          >
            <ListItemIcon>
              <LinkOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('logbook.feed.linkInstagramPost')}</ListItemText>
          </MenuItem>
        )}
        {(onEdit || onDelete || allowInstagramPosting || allowInstagramLinking) && <Divider />}
        <ClimbActions
          climb={climb}
          boardDetails={boardDetails}
          angle={item.angle}
          viewMode="list"
          exclude={excludeActions}
          onActionComplete={handleCloseActions}
        />
      </SwipeableDrawer>

      {allowInstagramPosting && (
        <PostToInstagramDialog
          open={instagramDialogOpen}
          onClose={() => setInstagramDialogOpen(false)}
          item={
            instagramDialogOpen
              ? {
                  boardType: item.boardType,
                  climbUuid: item.climbUuid,
                  climbName: item.climbName,
                  angle: item.angle,
                  grade: item.difficultyName,
                  setter: item.setterUsername,
                  layoutId: item.layoutId,
                }
              : null
          }
        />
      )}
      {allowInstagramLinking && (
        <AttachBetaLinkDialog
          open={betaLinkDialogOpen}
          onClose={() => setBetaLinkDialogOpen(false)}
          boardType={item.boardType}
          climbUuid={item.climbUuid}
          climbName={item.climbName}
          angle={item.angle}
          grade={item.difficultyName}
          setter={item.setterUsername}
          layoutId={item.layoutId}
          surface="logbook"
        />
      )}
    </>
  );
}
