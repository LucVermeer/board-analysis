'use client';

import SwipeableDrawer from '../swipeable-drawer/swipeable-drawer';
import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogAscentForm, type LogAscentSubmitState } from './logascent-form';
import { FormActions } from '@/app/components/form';
import type { BoardDetails, Climb } from '@/app/lib/types';

type LogAscentDrawerProps = {
  open: boolean;
  onClose: () => void;
  currentClimb: Climb | null;
  boardDetails: BoardDetails;
};

export const LogAscentDrawer: React.FC<LogAscentDrawerProps> = ({ open, onClose, currentClimb, boardDetails }) => {
  const { t } = useTranslation('climbs');
  const { t: tProfile } = useTranslation('profile');

  // The form's submit button lives in the drawer HEADER, not a footer: the iOS
  // keyboard buries a bottom action bar (see docs/mobile-sheets-vs-routes.md).
  // The form reports its label / saving / enabled state here and the header
  // button submits the form by id.
  const formId = useId();
  const [submitState, setSubmitState] = useState<LogAscentSubmitState>({
    submitLabel: tProfile('logbook.form.submit'),
    submitting: false,
    canSubmit: false,
  });

  // Pin the climb the user opened the form on. A remote queue advance
  // (driver moves the wall on to the next climb while User A is mid-log)
  // would otherwise change `currentClimb` underneath the form and React's
  // prop-change effect would wipe their draft. Snapshot on open, hold
  // until close, only update when the user genuinely re-opens on a new
  // climb. The form itself watches the live wall climb and shows a
  // "wall moved" banner when they diverge — see logascent-form.
  const [lockedClimb, setLockedClimb] = useState<Climb | null>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setLockedClimb(currentClimb);
    } else if (!open && wasOpenRef.current) {
      // Clear after close so the next open re-snapshots whatever climb the
      // user opens on (handles the case where the wall advanced while the
      // drawer was closed and the user reopens to log the new climb).
      setLockedClimb(null);
    }
    wasOpenRef.current = open;
  }, [open, currentClimb]);

  return (
    <SwipeableDrawer
      title={t('actions.tick.drawer.logAscent')}
      placement="bottom"
      onClose={onClose}
      open={open}
      fullHeight
      styles={{ wrapper: { height: '100%' } }}
      extra={
        lockedClimb ? (
          <FormActions
            formId={formId}
            submitLabel={submitState.submitLabel}
            submitting={submitState.submitting}
            disabled={!submitState.canSubmit}
            layout="row"
          />
        ) : undefined
      }
    >
      {lockedClimb && (
        <LogAscentForm
          key={lockedClimb.uuid}
          currentClimb={lockedClimb}
          onSwitchClimb={setLockedClimb}
          boardDetails={boardDetails}
          onClose={onClose}
          formId={formId}
          onSubmitStateChange={setSubmitState}
        />
      )}
    </SwipeableDrawer>
  );
};
