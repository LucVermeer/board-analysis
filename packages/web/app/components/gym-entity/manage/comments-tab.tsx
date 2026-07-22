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
  const hasComments = gym.commentCount > 0;

  // commentCount rides in with the gym, so the count / empty label costs no
  // extra round-trip (it's a load-time snapshot, not a live tally).
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
