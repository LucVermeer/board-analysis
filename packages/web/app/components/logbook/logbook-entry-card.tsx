'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import LocaleLink from '@/app/components/i18n/locale-link';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Rating from '@mui/material/Rating';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { AscentStatusIcon } from '@/app/components/ascent-status/ascent-status-icon';
import { normalizeAscentStatus, type AscentStatusValue } from '@/app/components/ascent-status/ascent-status-utils';
import VoteButton from '@/app/components/social/vote-button';
import FeedCommentButton from '@/app/components/social/feed-comment-button';
import { formatTickAbsoluteTime } from '@/app/lib/format-tick-time';

export type LogbookEntryUser = {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type LogbookEntryCardData = {
  climbedAt: string;
  angle: number;
  isMirror: boolean;
  /** Raw status from the server. The card normalizes via normalizeAscentStatus. */
  status?: string | null;
  attemptCount: number;
  quality?: number | null;
  comment?: string | null;
  /**
   * Tick UUID. When set, the card renders a like + comment footer targeting
   * this tick via the social `tick` entity type. Omit to render the card
   * without social affordances.
   *
   * The current user's vote on the tick is resolved by the enclosing
   * `VoteSummaryProvider` batch-fetch rather than being threaded through the
   * card, so there is no `userVote` prop here.
   */
  tickUuid?: string | null;
  upvotes?: number | null;
  downvotes?: number | null;
  commentCount?: number | null;
};

export type LogbookEntryCardProps = {
  entry: LogbookEntryCardData;
  showMirrorTag: boolean;
  user?: LogbookEntryUser;
};

export const LogbookEntryCard: React.FC<LogbookEntryCardProps> = ({
  entry,
  showMirrorTag,
  user,
}) => {
  const { t } = useTranslation('profile');
  const ascentStatus = normalizeAscentStatus({
    // normalizeAscentStatus does a runtime check for the three known values
    // and falls back to 'attempt' for anything else — safe for raw strings.
    status: entry.status as AscentStatusValue | null | undefined,
    tries: entry.attemptCount,
  });
  const hasSuccess = ascentStatus !== 'attempt';

  return (
    <Card sx={{ width: '100%' }}>
      <CardContent sx={{ p: 1.5 }}>
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Link
              component={LocaleLink}
              href={`/profile/${user.userId}`}
              aria-label={user.displayName || 'Climber profile'}
              sx={{ display: 'inline-flex' }}
            >
              <Avatar src={user.avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
                {!user.avatarUrl && <PersonOutlined sx={{ fontSize: 16 }} />}
              </Avatar>
            </Link>
            <Link component={LocaleLink} href={`/profile/${user.userId}`} underline="none" color="text.primary">
              <Typography variant="body2" fontWeight={600}>
                {user.displayName || 'Climber'}
              </Typography>
            </Link>
          </Box>
        )}
        <Stack spacing={1} sx={{ width: '100%' }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Typography variant="body2" component="span" fontWeight={600}>
              {formatTickAbsoluteTime(entry.climbedAt, 'MMM D, YYYY h:mm A')}
            </Typography>
            <Chip label={`${entry.angle}°`} size="small" color="primary" />
            <AscentStatusIcon status={ascentStatus} variant="icon" />
            {showMirrorTag && entry.isMirror && (
              <Chip label={t('logbook.entry.mirroredTag')} size="small" color="secondary" />
            )}
          </Stack>
          {hasSuccess && entry.quality != null && entry.quality > 0 && (
            <Stack direction="row" spacing={1}>
              <Rating readOnly value={entry.quality} max={5} size="small" />
            </Stack>
          )}
          <Stack direction="row" spacing={1}>
            <Typography variant="body2" component="span">
              {t('logbook.entry.attemptsLabel', { count: entry.attemptCount })}
            </Typography>
          </Stack>
          {entry.comment && (
            <Typography variant="body2" component="span" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {entry.comment}
            </Typography>
          )}
          {entry.tickUuid && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <VoteButton
                entityType="tick"
                entityId={entry.tickUuid}
                initialUpvotes={entry.upvotes ?? 0}
                initialDownvotes={entry.downvotes ?? 0}
                likeOnly
              />
              <FeedCommentButton entityType="tick" entityId={entry.tickUuid} commentCount={entry.commentCount ?? 0} />
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};
