'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Gym } from '@boardsesh/shared-schema';
import CommentSection from '@/app/components/social/comment-section';

// Comments tab: mounts the same CommentSection the public gym page uses (same
// gym entity, same thread, same subscription) so owners and editors can reply
// from the console. CommentSection owns the live count and empty state, so the
// header stays a stable topic title — nothing here is derived from a load-time
// snapshot that could go stale once a comment lands.
export default function CommentsTab({ gym }: { gym: Gym }) {
  const { t } = useTranslation('kiosk');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t('manage.comments.intro')}
      </Typography>
      <CommentSection entityType="gym" entityId={gym.uuid} title={t('manage.comments.heading')} />
    </Box>
  );
}
