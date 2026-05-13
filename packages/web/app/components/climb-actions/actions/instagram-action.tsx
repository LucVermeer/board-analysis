'use client';

import React, { useCallback, useMemo, useState } from 'react';
import InstagramIcon from '@mui/icons-material/Instagram';
import type { ClimbActionProps, ClimbActionResult } from '../types';
import { buildActionResult, computeActionDisplay } from '../action-view-renderer';
import PostToInstagramDialog from '@/app/components/library/post-to-instagram-dialog';
import AttachBetaLinkDialog from '@/app/components/beta-videos/attach-beta-link-dialog';
import { isInstagramPostingSupported } from '@/app/lib/instagram-posting';

export function InstagramAction({
  climb,
  boardDetails,
  angle,
  viewMode,
  size = 'default',
  showLabel,
  disabled,
  className,
  onComplete,
}: ClimbActionProps): ClimbActionResult {
  const { iconSize } = computeActionDisplay(viewMode, size, showLabel);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const isKilter = boardDetails.board_name === 'kilter';
  const canPost = isKilter && isInstagramPostingSupported();
  const canLink = isKilter && !canPost;
  const available = canPost || canLink;

  const label = canPost ? 'Post to Instagram' : 'Link Instagram video';

  const handleClick = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      e?.preventDefault();

      if (canPost) {
        setPostDialogOpen(true);
        return;
      }

      if (canLink) {
        setLinkDialogOpen(true);
      }
    },
    [canPost, canLink],
  );

  const dialogTarget = useMemo(
    () => ({
      boardType: boardDetails.board_name,
      climbUuid: climb.uuid,
      climbName: climb.name,
      angle,
      grade: climb.difficulty,
      setter: climb.setter_username,
      layoutId: climb.layoutId,
    }),
    [boardDetails.board_name, climb.uuid, climb.name, angle, climb.difficulty, climb.setter_username, climb.layoutId],
  );

  const extraContent = (
    <>
      <PostToInstagramDialog
        open={postDialogOpen}
        onClose={() => {
          setPostDialogOpen(false);
          onComplete?.();
        }}
        item={dialogTarget}
      />
      <AttachBetaLinkDialog
        open={linkDialogOpen}
        onClose={() => {
          setLinkDialogOpen(false);
          onComplete?.();
        }}
        boardType={boardDetails.board_name}
        climbUuid={climb.uuid}
        climbName={climb.name}
        angle={angle}
      />
    </>
  );

  return buildActionResult({
    key: 'instagram',
    label,
    icon: <InstagramIcon sx={{ fontSize: iconSize }} />,
    onClick: handleClick,
    viewMode,
    size,
    showLabel,
    disabled,
    className,
    available,
    extraContent,
  });
}

export default InstagramAction;
