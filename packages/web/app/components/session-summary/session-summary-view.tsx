'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '@boardsesh/shared-schema';
import { getGradeColor as getVividGradeColor } from '@/app/lib/grade-colors';
import { useGradeFormat } from '@/app/hooks/use-grade-format';

type SessionSummaryViewProps = {
  summary: SessionSummary;
};

export default function SessionSummaryView({ summary }: SessionSummaryViewProps) {
  const { t } = useTranslation('session');
  const { formatGrade, loaded: gradeFormatLoaded } = useGradeFormat();
  const maxGradeCount = Math.max(...summary.gradeDistribution.map((g) => g.count), 1);

  const formatDuration = (minutes: number | null | undefined) => {
    if (!minutes) return null;
    if (minutes < 60) return t('summary.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? t('summary.hoursAndMinutes', { hours, mins }) : t('summary.hours', { count: hours });
  };

  return (
    <Stack spacing={2}>
      {/* Header stats */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Card sx={{ flex: 1, minWidth: 120 }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} color="primary">
              {summary.totalSends}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('summary.sends')}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 120 }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700}>
              {summary.totalAttempts}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('summary.attempts')}
            </Typography>
          </CardContent>
        </Card>
        {summary.durationMinutes != null && (
          <Card sx={{ flex: 1, minWidth: 120 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <TimerOutlined fontSize="small" color="action" />
                <Typography variant="h5" fontWeight={700}>
                  {formatDuration(summary.durationMinutes)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {t('summary.duration')}
              </Typography>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* Goal */}
      {summary.goal && (
        <Card>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FlagOutlined fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {t('summary.goal')}
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {summary.goal}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Hardest Climb */}
      {summary.hardestClimb && (
        <Card>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmojiEventsOutlined fontSize="small" sx={{ color: 'warning.main' }} />
              <Typography variant="body2" color="text.secondary">
                {t('summary.hardestSend')}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {summary.hardestClimb.climbName}
              </Typography>
              {gradeFormatLoaded ? (
                <Chip
                  label={formatGrade(summary.hardestClimb.grade) ?? summary.hardestClimb.grade}
                  size="small"
                  sx={{
                    bgcolor: getVividGradeColor(summary.hardestClimb.grade),
                    color: '#fff',
                    fontWeight: 600,
                  }}
                />
              ) : (
                <Skeleton variant="rounded" width={40} height={24} />
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Grade Distribution */}
      {summary.gradeDistribution.length > 0 && (
        <Card>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('summary.gradeDistribution')}
            </Typography>
            <Stack spacing={0.75}>
              {summary.gradeDistribution.map((g) => (
                <Box key={g.grade} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {gradeFormatLoaded ? (
                    <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 600, textAlign: 'right' }}>
                      {formatGrade(g.grade) ?? g.grade}
                    </Typography>
                  ) : (
                    <Skeleton variant="text" width={40} sx={{ fontSize: '0.875rem' }} />
                  )}
                  <LinearProgress
                    variant="determinate"
                    value={(g.count / maxGradeCount) * 100}
                    sx={{
                      flex: 1,
                      height: 16,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: getVividGradeColor(g.grade) ?? 'action.selected',
                        borderRadius: 1,
                      },
                    }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }}>
                    {g.count}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Participants */}
      {summary.participants.length > 0 && (
        <Card>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('summary.participants')}
            </Typography>
            <List disablePadding dense>
              {summary.participants.map((p) => (
                <ListItem key={p.userId} disablePadding sx={{ py: 0.5 }}>
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar src={p.avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
                      {!p.avatarUrl && <PersonOutlined sx={{ fontSize: 16 }} />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={p.displayName || 'Anonymous'}
                    secondary={`${p.sends} sends / ${p.attempts} attempts`}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
