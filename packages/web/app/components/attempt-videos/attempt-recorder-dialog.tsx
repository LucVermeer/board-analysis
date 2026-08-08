'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import Stop from '@mui/icons-material/Stop';
import Refresh from '@mui/icons-material/Refresh';
import {
  appendPrivateAttemptChunk,
  createPrivateAttemptUpload,
  deletePrivateAttemptUpload,
  finalizePrivateAttemptUpload,
  getPrivateAttemptUpload,
  type CreatePrivateAttemptUploadInput,
} from '@/app/lib/private-attempt-videos-client';

type RecorderPhase =
  | 'permission'
  | 'ready'
  | 'recording'
  | 'cancelling'
  | 'stopping'
  | 'finalizing'
  | 'saved'
  | 'error';

type PendingChunk = {
  startOffset: number;
  blob: Blob;
};

export type AttemptRecorderTarget = {
  climbUuid: string;
  climbName: string;
  layoutId: 3;
  angle: number;
  isMirror: boolean;
  boardId: number | null;
  sessionId: string | null;
};

type AttemptRecorderDialogProps = {
  open: boolean;
  token: string;
  target: AttemptRecorderTarget;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
};

const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

function supportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export default function AttemptRecorderDialog({
  open,
  token,
  target,
  onBusyChange,
  onClose,
  onSaved,
}: AttemptRecorderDialogProps) {
  const { t } = useTranslation('session');
  const [phase, setPhase] = useState<RecorderPhase>('permission');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const videoUuidRef = useRef<string | null>(null);
  const uploadOffsetRef = useRef(0);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const uploadErrorRef = useRef<unknown>(null);
  const chunksRef = useRef<PendingChunk[]>([]);
  const capturedBytesRef = useRef(0);
  const startedAtRef = useRef(0);
  const recordedAtRef = useRef('');
  const durationMsRef = useRef(0);
  const mimeTypeRef = useRef('');

  const busy = phase === 'recording' || phase === 'cancelling' || phase === 'stopping' || phase === 'finalizing';

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCapture = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // The recorder may already be stopping after a device-level failure.
      }
    }
    recorderRef.current = null;
    stopCamera();
  }, [stopCamera]);

  const requestCamera = useCallback(async () => {
    setPhase('permission');
    setErrorCode(null);
    if (!navigator.mediaDevices?.getUserMedia || !supportedMimeType()) {
      setErrorCode('UNSUPPORTED_BROWSER');
      setPhase('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase('ready');
    } catch (error) {
      setErrorCode((error as DOMException).name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'CAMERA_UNAVAILABLE');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void requestCamera();
    return () => stopCapture();
  }, [open, requestCamera, stopCapture]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const enqueueChunk = useCallback(
    (chunk: Blob) => {
      const pendingChunk = { startOffset: capturedBytesRef.current, blob: chunk };
      capturedBytesRef.current += chunk.size;
      chunksRef.current.push(pendingChunk);
      uploadChainRef.current = uploadChainRef.current.then(async () => {
        const videoUuid = videoUuidRef.current;
        if (!videoUuid) throw new Error('Recording upload was not initialized');
        if (uploadOffsetRef.current < pendingChunk.startOffset) {
          throw Object.assign(new Error('A recording chunk is missing'), { code: 'UPLOAD_INTERRUPTED' });
        }
        const uploadedWithinChunk = uploadOffsetRef.current - pendingChunk.startOffset;
        const remaining = pendingChunk.blob.slice(Math.max(0, uploadedWithinChunk));
        if (remaining.size === 0) {
          chunksRef.current = chunksRef.current.filter(
            ({ startOffset, blob }) => startOffset + blob.size > uploadOffsetRef.current,
          );
          return;
        }
        uploadOffsetRef.current = await appendPrivateAttemptChunk(token, videoUuid, uploadOffsetRef.current, remaining);
        chunksRef.current = chunksRef.current.filter(
          ({ startOffset, blob }) => startOffset + blob.size > uploadOffsetRef.current,
        );
      });
      void uploadChainRef.current.catch((error) => {
        uploadErrorRef.current = error;
      });
    },
    [token],
  );

  const startRecording = useCallback(async () => {
    const stream = streamRef.current;
    const mimeType = supportedMimeType();
    if (!stream || !mimeType) return;
    setErrorCode(null);
    chunksRef.current = [];
    capturedBytesRef.current = 0;
    uploadChainRef.current = Promise.resolve();
    uploadErrorRef.current = null;
    uploadOffsetRef.current = 0;
    recordedAtRef.current = new Date().toISOString();
    mimeTypeRef.current = mimeType;
    try {
      const input: CreatePrivateAttemptUploadInput = {
        clientRecordingId: crypto.randomUUID(),
        climbUuid: target.climbUuid,
        layoutId: target.layoutId,
        angle: target.angle,
        isMirror: target.isMirror,
        boardId: target.boardId,
        sessionId: target.sessionId,
        mimeType,
        recordedAt: recordedAtRef.current,
      };
      const initialized = await createPrivateAttemptUpload(token, input);
      videoUuidRef.current = initialized.video.uuid;
      uploadOffsetRef.current = initialized.uploadOffset;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) enqueueChunk(event.data);
      });
      recorder.addEventListener('error', () => {
        stopCapture();
        setErrorCode('RECORDER_FAILED');
        setPhase('error');
      });
      startedAtRef.current = performance.now();
      setElapsedMs(0);
      recorder.start(2_000);
      setPhase('recording');
    } catch (error) {
      setErrorCode((error as { code?: string }).code ?? 'UPLOAD_INIT_FAILED');
      setPhase('error');
    }
  }, [enqueueChunk, stopCapture, target, token]);

  const finishUpload = useCallback(async () => {
    setPhase('finalizing');
    try {
      await uploadChainRef.current;
      if (uploadErrorRef.current) throw uploadErrorRef.current;
      const videoUuid = videoUuidRef.current;
      if (!videoUuid) throw new Error('Recording upload was not initialized');
      await finalizePrivateAttemptUpload(token, videoUuid, durationMsRef.current);
      setPhase('saved');
      stopCamera();
      onSaved();
    } catch (error) {
      setErrorCode((error as { code?: string }).code ?? 'UPLOAD_FAILED');
      stopCamera();
      setPhase('error');
    }
  }, [onSaved, stopCamera, token]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    setPhase('stopping');
    durationMsRef.current = Math.max(0, Math.round(performance.now() - startedAtRef.current));
    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.stop();
    });
    recorderRef.current = null;
    await finishUpload();
  }, [finishUpload]);

  const cancelRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    setPhase('cancelling');
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }
    recorderRef.current = null;
    stopCamera();
    await uploadChainRef.current.catch(() => undefined);
    const videoUuid = videoUuidRef.current;
    if (videoUuid) await deletePrivateAttemptUpload(token, videoUuid).catch(() => undefined);
    videoUuidRef.current = null;
    chunksRef.current = [];
    onClose();
  }, [onClose, stopCamera, token]);

  const uploadAllChunks = useCallback(
    async (videoUuid: string, initialOffset: number) => {
      let offset = initialOffset;
      for (const { startOffset, blob } of chunksRef.current) {
        const chunkEnd = startOffset + blob.size;
        if (offset < startOffset) {
          throw Object.assign(new Error('An acknowledged recording chunk is no longer in memory'), {
            code: 'RECORDING_RESTART_REQUIRED',
          });
        }
        if (offset < chunkEnd) {
          let offsetRepairs = 0;
          while (offset < chunkEnd) {
            const remaining = blob.slice(Math.max(0, offset - startOffset));
            try {
              offset = await appendPrivateAttemptChunk(token, videoUuid, offset, remaining);
            } catch (error) {
              const uploadError = error as { code?: string; uploadOffset?: number };
              const repairedOffset = uploadError.uploadOffset;
              if (
                uploadError.code !== 'OFFSET_MISMATCH' ||
                !Number.isSafeInteger(repairedOffset) ||
                repairedOffset == null ||
                repairedOffset <= offset ||
                repairedOffset > capturedBytesRef.current ||
                offsetRepairs >= 2
              ) {
                throw error;
              }
              offset = repairedOffset;
              offsetRepairs += 1;
            }
          }
          chunksRef.current = chunksRef.current.filter((pending) => pending.startOffset + pending.blob.size > offset);
        }
      }
      if (offset !== capturedBytesRef.current) {
        throw Object.assign(new Error('The recording cannot be resumed without re-recording'), {
          code: 'RECORDING_RESTART_REQUIRED',
        });
      }
      uploadOffsetRef.current = offset;
    },
    [token],
  );

  const retryUpload = useCallback(async () => {
    setPhase('finalizing');
    setErrorCode(null);
    try {
      let videoUuid = videoUuidRef.current;
      if (videoUuid) {
        const current = await getPrivateAttemptUpload(token, videoUuid).catch(() => null);
        if (current?.video.status === 'ready') {
          setPhase('saved');
          stopCamera();
          onSaved();
          return;
        }
        if (current?.video.status === 'finalizing') {
          await finalizePrivateAttemptUpload(token, videoUuid, durationMsRef.current);
          setPhase('saved');
          stopCamera();
          onSaved();
          return;
        }
        if (current?.video.status === 'uploading') {
          await uploadAllChunks(videoUuid, current.uploadOffset);
          await finalizePrivateAttemptUpload(token, videoUuid, durationMsRef.current);
          setPhase('saved');
          stopCamera();
          onSaved();
          return;
        }
        await deletePrivateAttemptUpload(token, videoUuid).catch(() => undefined);
      }

      if (capturedBytesRef.current > 0 && chunksRef.current[0]?.startOffset !== 0) {
        throw Object.assign(new Error('The recording must be made again'), {
          code: 'RECORDING_RESTART_REQUIRED',
        });
      }

      const initialized = await createPrivateAttemptUpload(token, {
        clientRecordingId: crypto.randomUUID(),
        climbUuid: target.climbUuid,
        layoutId: target.layoutId,
        angle: target.angle,
        isMirror: target.isMirror,
        boardId: target.boardId,
        sessionId: target.sessionId,
        mimeType: mimeTypeRef.current,
        recordedAt: recordedAtRef.current,
      });
      videoUuid = initialized.video.uuid;
      videoUuidRef.current = videoUuid;
      await uploadAllChunks(videoUuid, initialized.uploadOffset);
      await finalizePrivateAttemptUpload(token, videoUuid, durationMsRef.current);
      setPhase('saved');
      stopCamera();
      onSaved();
    } catch (error) {
      setErrorCode((error as { code?: string }).code ?? 'UPLOAD_FAILED');
      setPhase('error');
    }
  }, [onSaved, stopCamera, target, token, uploadAllChunks]);

  const handleClose = useCallback(() => {
    if (busy) return;
    const videoUuid = videoUuidRef.current;
    if (phase !== 'saved' && videoUuid) void deletePrivateAttemptUpload(token, videoUuid).catch(() => undefined);
    stopCapture();
    onClose();
  }, [busy, onClose, phase, stopCapture, token]);

  const errorMessage = errorCode
    ? t(`attemptRecorder.errors.${errorCode}`, { defaultValue: t('attemptRecorder.errors.default') })
    : '';

  return (
    <Dialog open={open} fullScreen onClose={handleClose} disableEscapeKeyDown={busy}>
      <Box sx={{ position: 'relative', height: '100dvh', bgcolor: 'common.black', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label={t('attemptRecorder.previewAria')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            position: 'absolute',
            zIndex: 2,
            inset: 'max(12px, env(safe-area-inset-top)) 12px auto',
            color: 'common.white',
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {target.climbName}
            </Typography>
            <Typography variant="caption">{target.angle}°</Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            disabled={busy}
            aria-label={t('attemptRecorder.closeAria')}
            sx={{ color: 'common.white', bgcolor: 'rgba(0,0,0,.45)' }}
          >
            <CloseOutlined />
          </IconButton>
        </Stack>

        {(phase === 'permission' || phase === 'cancelling' || phase === 'stopping' || phase === 'finalizing') && (
          <Stack
            alignItems="center"
            spacing={1}
            sx={{
              position: 'absolute',
              inset: 0,
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,.5)',
              color: 'common.white',
            }}
          >
            <CircularProgress color="inherit" />
            <Typography>{t(`attemptRecorder.status.${phase}`)}</Typography>
          </Stack>
        )}

        {phase === 'error' && (
          <Stack
            alignItems="center"
            spacing={2}
            sx={{
              position: 'absolute',
              inset: 0,
              justifyContent: 'center',
              p: 3,
              bgcolor: 'rgba(0,0,0,.68)',
              color: 'common.white',
              textAlign: 'center',
            }}
          >
            <Typography>{errorMessage}</Typography>
            {videoUuidRef.current || chunksRef.current.length > 0 ? (
              <Button variant="contained" startIcon={<Refresh />} onClick={retryUpload}>
                {t('attemptRecorder.retryUpload')}
              </Button>
            ) : (
              <Button variant="contained" startIcon={<Refresh />} onClick={requestCamera}>
                {t('attemptRecorder.retryCamera')}
              </Button>
            )}
          </Stack>
        )}

        {phase === 'saved' && (
          <Stack
            alignItems="center"
            spacing={2}
            sx={{
              position: 'absolute',
              inset: 0,
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,.68)',
              color: 'common.white',
            }}
          >
            <Typography variant="h6">{t('attemptRecorder.saved')}</Typography>
            <Button variant="contained" onClick={handleClose}>
              {t('attemptRecorder.done')}
            </Button>
          </Stack>
        )}

        {(phase === 'ready' || phase === 'recording') && (
          <Stack
            alignItems="center"
            spacing={1}
            sx={{ position: 'absolute', inset: 'auto 0 max(24px, env(safe-area-inset-bottom))' }}
          >
            {phase === 'recording' && (
              <Typography sx={{ color: 'common.white', fontVariantNumeric: 'tabular-nums' }}>
                {formatElapsed(elapsedMs)}
              </Typography>
            )}
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: 72 }}>
              {phase === 'recording' && (
                <Button variant="contained" color="inherit" onClick={cancelRecording} sx={{ color: 'common.black' }}>
                  {t('attemptRecorder.cancelRecording')}
                </Button>
              )}
              <IconButton
                onClick={phase === 'recording' ? stopRecording : startRecording}
                aria-label={phase === 'recording' ? t('attemptRecorder.stopAria') : t('attemptRecorder.startAria')}
                sx={{
                  width: 72,
                  height: 72,
                  color: 'common.white',
                  bgcolor: phase === 'recording' ? 'error.main' : 'rgba(215,35,35,.92)',
                  border: '4px solid white',
                  '&:hover': { bgcolor: 'error.dark' },
                }}
              >
                {phase === 'recording' ? <Stop fontSize="large" /> : <FiberManualRecord fontSize="large" />}
              </IconButton>
            </Stack>
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}
