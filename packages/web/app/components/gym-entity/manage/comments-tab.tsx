'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Gym } from '@boardsesh/shared-schema';
import CommentSection from '@/app/components/social/comment-section';

/**
 * Comments tab: surfaces the gym's public comment thread inside the manage
 * console so owners and editors can read and reply without opening the public
 * page (and turning up in search). It mounts the very same CommentSection the
 * public gym page uses — same gym entity, same thread, same live-update
 * subscription — so there's no second comment store to keep in step, and no new
 * query to maintain.
 */
export default function CommentsTab({ gym }: { gym: Gym }) {
  const { t } = useTranslation('kiosk');
  const hasComments = gym.commentCount > 0;

  // The section header doubles as the count / empty line: the thread count when
  // the crew's talking, a climber-voice nudge when it's quiet. The gym already
  // ships its own commentCount, so labelling the tab costs no extra round-trip.
  const threadTitle = hasComments
    ? t('manage.comments.count', { count: gym.commentCount })
    : t('manage.comments.empty');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t('manage.comments.intro')}
      </Typography>
      <CommentSection entityType="gym" entityId={gym.uuid} title={threadTitle} />
    </Box>
  );
}
