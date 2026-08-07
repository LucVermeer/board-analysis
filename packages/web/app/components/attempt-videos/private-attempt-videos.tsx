'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import type { PrivateAttemptVideo } from '@boardsesh/shared-schema';
import {
  GET_PRIVATE_ATTEMPT_VIDEOS,
  type GetPrivateAttemptVideosResponse,
} from '@boardsesh/graphql/operations/private-attempt-videos';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { deletePrivateAttemptUpload } from '@/app/lib/private-attempt-videos-client';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import VideoSpeedControl from './video-speed-control';

type PrivateAttemptVideosProps = {
  climbUuid: string;
  layoutId: number;
  angle: number;
};

export function PrivateAttemptVideoRow({ video, onDelete }: { video: PrivateAttemptVideo; onDelete: () => void }) {
  const { t, i18n } = useTranslation('climbs');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [speed, setSpeed] = useState(1);
  const updateSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
  };
  return (
    <Box sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <video
        ref={videoRef}
        src={video.playbackPath}
        controls
        playsInline
        preload="metadata"
        aria-label={t('attemptVideos.videoAria')}
        style={{ display: 'block', width: '100%', maxHeight: 520, background: '#000', borderRadius: 6 }}
      />
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2">
            {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(video.recordedAt),
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('attemptVideos.duration', { seconds: Math.round(video.durationMs / 1000) })}
          </Typography>
        </Box>
        <Tooltip title={t('attemptVideos.deleteAria')}>
          <IconButton onClick={onDelete} aria-label={t('attemptVideos.deleteAria')}>
            <DeleteOutline />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ mt: 1 }}>
        <VideoSpeedControl value={speed} onChange={updateSpeed} />
      </Box>
    </Box>
  );
}

export default function PrivateAttemptVideos({ climbUuid, layoutId, angle }: PrivateAttemptVideosProps) {
  const { t } = useTranslation('climbs');
  const { token, isAuthenticated, isLoading: authLoading } = useWsAuthToken();
  const queryClient = useQueryClient();
  const queryKey = ['privateAttemptVideos', climbUuid, layoutId, angle];
  const [deleteTarget, setDeleteTarget] = useState<PrivateAttemptVideo | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const client = createGraphQLHttpClient(token);
      const result = await client.request<GetPrivateAttemptVideosResponse>(GET_PRIVATE_ATTEMPT_VIDEOS, {
        climbUuid,
        layoutId,
        angle,
      });
      return result.privateAttemptVideos;
    },
    enabled: isAuthenticated && !!token && layoutId === 3,
    staleTime: 30_000,
  });
  const deleteMutation = useMutation({
    mutationFn: async (videoUuid: string) => {
      if (!token) throw new Error('Authentication required');
      await deletePrivateAttemptUpload(token, videoUuid);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  if (authLoading || isLoading) return <CircularProgress size={24} aria-label={t('attemptVideos.loading')} />;
  if (!isAuthenticated) return null;
  if (data.length === 0) return <Typography color="text.secondary">{t('attemptVideos.empty')}</Typography>;

  return (
    <>
      <Box>
        {data.map((video) => (
          <PrivateAttemptVideoRow key={video.uuid} video={video} onDelete={() => setDeleteTarget(video)} />
        ))}
      </Box>
      <Dialog open={deleteTarget != null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('attemptVideos.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('attemptVideos.deleteBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('attemptVideos.cancel')}</Button>
          <Button
            color="error"
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.uuid)}
            disabled={deleteMutation.isPending}
          >
            {t('attemptVideos.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
