'use client';

// Kiosks tab: the gym's TV configs. Lists every kiosk (name, derived preset,
// rail on/off, open-TV link), creates new ones (server assigns the URL slug),
// and hosts the kiosk editor for the one being edited.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import AddOutlined from '@mui/icons-material/AddOutlined';
import TvOutlined from '@mui/icons-material/TvOutlined';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import { kioskPresetForBoardCount, MAX_KIOSKS_PER_GYM } from '@boardsesh/kiosk';
import {
  DELETE_GYM_KIOSK,
  GET_GYM_BOARDS,
  GET_GYM_KIOSKS,
  type DeleteGymKioskMutationResponse,
  type DeleteGymKioskMutationVariables,
  type GetGymBoardsQueryResponse,
  type GetGymBoardsQueryVariables,
  type GetGymKiosksQueryResponse,
  type GetGymKiosksQueryVariables,
} from '@boardsesh/graphql/operations';
import type { GymKiosk } from '@boardsesh/shared-schema';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import LocaleLink from '@/app/components/i18n/locale-link';
import { themeTokens } from '@/app/theme/theme-config';
import { buildKioskViewModel } from '../../kiosk/kiosk-view-model';
import ManageTabEmptyState from './manage-tab-empty-state';
import KioskCreateDialog from './kiosk-create-dialog';
import KioskEditor from './kiosk-editor';
import type { GymManageTabProps } from './tab-props';

export default function KiosksTab({ gym }: GymManageTabProps) {
  const { t } = useTranslation('kiosk');
  const { token } = useWsAuthToken();
  const { showMessage } = useSnackbar();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingKioskUuid, setEditingKioskUuid] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GymKiosk | null>(null);

  const kiosksQueryKey = ['gymKiosks', gym.uuid];

  const {
    data: kiosks,
    isLoading: isLoadingKiosks,
    isError: kiosksLoadFailed,
  } = useQuery({
    queryKey: kiosksQueryKey,
    queryFn: async () => {
      const client = createGraphQLHttpClient(token);
      const response = await client.request<GetGymKiosksQueryResponse, GetGymKiosksQueryVariables>(GET_GYM_KIOSKS, {
        gymUuid: gym.uuid,
      });
      return response.gymKiosks;
    },
    enabled: !!token,
  });

  // The editor needs the gym's full board list (editors see private/unlisted
  // boards too). Fetched only once a kiosk is opened for editing.
  const { data: gymBoards } = useQuery({
    queryKey: ['gymBoards', gym.uuid],
    queryFn: async () => {
      const client = createGraphQLHttpClient(token);
      const response = await client.request<GetGymBoardsQueryResponse, GetGymBoardsQueryVariables>(GET_GYM_BOARDS, {
        gymUuid: gym.uuid,
      });
      return response.gymBoards;
    },
    enabled: !!token && editingKioskUuid !== null,
  });

  const deleteMutation = useEntityMutation<DeleteGymKioskMutationResponse, DeleteGymKioskMutationVariables>(
    DELETE_GYM_KIOSK,
    { successMessage: t('manage.kiosks.deleted'), errorMessage: t('manage.kiosks.deleteFailed') },
  );

  const handleCreated = (kiosk: GymKiosk) => {
    queryClient.setQueryData<GymKiosk[]>(kiosksQueryKey, (previous) => (previous ? [...previous, kiosk] : [kiosk]));
    setCreateDialogOpen(false);
    showMessage(t('manage.createDialog.created', { slug: kiosk.slug }), 'success');
    // Straight into the editor — a fresh kiosk has no boards yet.
    setEditingKioskUuid(kiosk.uuid);
  };

  const handleSaved = (kiosk: GymKiosk) => {
    queryClient.setQueryData<GymKiosk[]>(kiosksQueryKey, (previous) =>
      previous ? previous.map((existing) => (existing.uuid === kiosk.uuid ? kiosk : existing)) : [kiosk],
    );
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const result = await deleteMutation.execute({ kioskUuid: target.uuid });
    if (result) {
      queryClient.setQueryData<GymKiosk[]>(kiosksQueryKey, (previous) =>
        previous ? previous.filter((existing) => existing.uuid !== target.uuid) : previous,
      );
    }
  };

  const editingKiosk =
    editingKioskUuid === null ? null : (kiosks ?? []).find((candidate) => candidate.uuid === editingKioskUuid);

  if (editingKiosk) {
    return (
      <KioskEditor
        gym={gym}
        kiosk={editingKiosk}
        gymBoards={gymBoards ?? null}
        onBack={() => setEditingKioskUuid(null)}
        onSaved={handleSaved}
      />
    );
  }

  if (isLoadingKiosks) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (kiosksLoadFailed) {
    return (
      <Typography variant="body2" color="error" sx={{ py: 2 }}>
        {t('manage.kiosks.loadError')}
      </Typography>
    );
  }

  const kioskList = kiosks ?? [];
  const atCap = kioskList.length >= MAX_KIOSKS_PER_GYM;

  if (kioskList.length === 0) {
    return (
      <>
        <ManageTabEmptyState
          icon={<TvOutlined sx={{ fontSize: 40 }} />}
          title={t('manage.kiosks.emptyTitle')}
          body={t('manage.kiosks.emptyBody')}
          ctaLabel={t('manage.kiosks.cta')}
          onCtaClick={() => setCreateDialogOpen(true)}
        />
        <KioskCreateDialog
          open={createDialogOpen}
          gymUuid={gym.uuid}
          onClose={() => setCreateDialogOpen(false)}
          onCreated={handleCreated}
        />
      </>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold }}>
            {t('manage.kiosks.heading')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('manage.kiosks.description')}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddOutlined />}
            onClick={() => setCreateDialogOpen(true)}
            disabled={atCap}
            sx={{ textTransform: 'none' }}
          >
            {t('manage.kiosks.newKiosk')}
          </Button>
          {atCap && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('manage.kiosks.capReached', { max: MAX_KIOSKS_PER_GYM })}
            </Typography>
          )}
        </Box>
      </Box>

      {!gym.slug && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {t('manage.kiosks.needSlugHint')}
        </Typography>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        {kioskList.map((kiosk, index) => {
          // gymKiosks returns oldest-first; the resolver serves the oldest live
          // kiosk at the slug-less default URL /kiosk/{gym-slug}.
          const isDefaultKiosk = index === 0;
          const preset = kioskPresetForBoardCount(kiosk.boards.length);
          const hasRail = buildKioskViewModel(kiosk).leaderboard !== null;
          const tvPath =
            gym.slug === null || gym.slug === undefined
              ? null
              : isDefaultKiosk
                ? `/kiosk/${gym.slug}`
                : `/kiosk/${gym.slug}/${kiosk.slug}`;

          return (
            <Card key={kiosk.uuid} variant="outlined">
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                  <Typography
                    component="span"
                    sx={{ fontWeight: themeTokens.typography.fontWeight.semibold, fontSize: '1.05rem' }}
                  >
                    {kiosk.name}
                  </Typography>
                  {isDefaultKiosk && (
                    <Chip size="small" variant="outlined" color="primary" label={t('manage.kiosks.defaultBadge')} />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {tvPath ?? t('manage.kiosks.urlPending', { slug: kiosk.slug })}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={preset === null ? t('manage.presets.none') : t(`manage.presets.${preset}`)}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t('manage.kiosks.boardCount', { count: kiosk.boards.length })}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={hasRail ? t('manage.kiosks.railOn') : t('manage.kiosks.railOff')}
                  />
                </Box>
              </CardContent>
              <CardActions>
                {tvPath ? (
                  <Button
                    component={LocaleLink}
                    href={tvPath}
                    target="_blank"
                    rel="noopener"
                    size="small"
                    startIcon={<LaunchOutlined />}
                    sx={{ textTransform: 'none' }}
                  >
                    {t('manage.kiosks.openTv')}
                  </Button>
                ) : (
                  <Tooltip title={t('manage.kiosks.openTvNeedsSlug')}>
                    <span>
                      <Button size="small" startIcon={<LaunchOutlined />} disabled sx={{ textTransform: 'none' }}>
                        {t('manage.kiosks.openTv')}
                      </Button>
                    </span>
                  </Tooltip>
                )}
                <Button size="small" onClick={() => setEditingKioskUuid(kiosk.uuid)} sx={{ textTransform: 'none' }}>
                  {t('manage.kiosks.edit')}
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() => setDeleteTarget(kiosk)}
                  sx={{ textTransform: 'none' }}
                >
                  {t('manage.kiosks.delete')}
                </Button>
              </CardActions>
            </Card>
          );
        })}
      </Box>

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('manage.kiosks.deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('manage.kiosks.deleteBody', { name: deleteTarget?.name ?? '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none' }}>
            {t('manage.kiosks.cancel')}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus sx={{ textTransform: 'none' }}>
            {t('manage.kiosks.deleteConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <KioskCreateDialog
        open={createDialogOpen}
        gymUuid={gym.uuid}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleCreated}
      />
    </Box>
  );
}
