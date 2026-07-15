'use client';

// Create-kiosk dialog: just a name. The URL slug is derived server-side and
// made unique within the gym, so instead of mirroring that derivation on the
// client we say "URL assigned on create" and surface the returned slug.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import {
  CREATE_GYM_KIOSK,
  type CreateGymKioskMutationResponse,
  type CreateGymKioskMutationVariables,
} from '@boardsesh/graphql/operations';
import type { GymKiosk } from '@boardsesh/shared-schema';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';

const KIOSK_NAME_MAX_LENGTH = 100;

type KioskCreateDialogProps = {
  open: boolean;
  gymUuid: string;
  onClose: () => void;
  /** Called with the created kiosk (carrying the server-derived slug). */
  onCreated: (kiosk: GymKiosk) => void;
};

export default function KioskCreateDialog({ open, gymUuid, onClose, onCreated }: KioskCreateDialogProps) {
  const { t } = useTranslation('kiosk');
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createMutation = useEntityMutation<CreateGymKioskMutationResponse, CreateGymKioskMutationVariables>(
    CREATE_GYM_KIOSK,
    { errorMessage: t('manage.createDialog.createFailed') },
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setIsCreating(true);
    try {
      const data = await createMutation.execute({ input: { gymUuid, name: trimmedName } });
      if (data) {
        setName('');
        onCreated(data.createGymKiosk);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={isCreating ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleCreate}>
        <DialogTitle>{t('manage.createDialog.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t('manage.createDialog.body')}</DialogContentText>
          <TextField
            label={t('manage.createDialog.nameLabel')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('manage.createDialog.namePlaceholder')}
            helperText={t('manage.createDialog.urlHint')}
            fullWidth
            size="small"
            autoFocus
            slotProps={{ htmlInput: { maxLength: KIOSK_NAME_MAX_LENGTH } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isCreating} sx={{ textTransform: 'none' }}>
            {t('manage.createDialog.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isCreating || !name.trim()}
            sx={{ textTransform: 'none' }}
          >
            {isCreating ? <CircularProgress size={20} color="inherit" /> : t('manage.createDialog.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
