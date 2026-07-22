'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Gym } from '@boardsesh/shared-schema';
import CommentSection from '@/app/components/social/comment-section';

// Comments tab: mounts the same CommentSection the public gym page uses (same
// gym entity, same thread, same subscription) so owners and editors can reply
// from the console — no second comment store, no new query.
export default function CommentsTab({ gym }: { gym: Gym }) {
  const { t } = useTranslation('kiosk');
  // Frame the header off the gym's load-time commentCount only to pick between a
  // heading and the empty-state nudge — the accurate, live count is rendered by
  // the CommentSection below, so a snapshot here never shows a stale number.
  const hasComments = (gym.commentCount ?? 0) > 0;
  const threadTitle = hasComments ? t('manage.comments.heading') : t('manage.comments.empty');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t('manage.comments.intro')}
      </Typography>
      <CommentSection entityType="gym" entityId={gym.uuid} title={threadTitle} />
    </Box>
  );
}
