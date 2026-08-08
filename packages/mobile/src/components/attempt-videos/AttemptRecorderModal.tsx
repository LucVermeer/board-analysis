import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { useTheme } from '../../providers/theme-provider';
import {
  createPrivateAttemptUpload,
  deletePrivateAttemptUpload,
  finalizePrivateAttemptUpload,
  getPrivateAttemptUpload,
  PrivateAttemptApiError,
  uploadPrivateAttemptFile,
} from '../../lib/private-attempt-videos-client';

type RecorderPhase =
  | 'permission'
  | 'ready'
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'finalizing'
  | 'saved'
  | 'error'
  | 'cancelling';

export type AttemptRecorderTarget = {
  climbUuid: string;
  climbName: string;
  angle: number;
  isMirror: boolean;
  sessionId: string | null;
};

type AttemptRecorderModalProps = {
  visible: boolean;
  target: AttemptRecorderTarget | null;
  onClose: () => void;
  onSaved: () => void;
};

const MAX_DURATION_SECONDS = 60 * 60;
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function AttemptRecorderModal({ visible, target, onClose, onSaved }: AttemptRecorderModalProps) {
  const { t } = useTranslation('session');
  const { systemColors, brandColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const permissionLoaded = permission != null;
  const permissionGranted = permission?.granted ?? false;
  const canAskForPermission = permission?.canAskAgain ?? false;
  const [phase, setPhase] = useState<RecorderPhase>('permission');
  const [errorCode, setErrorCode] = useState('default');
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const cameraRef = useRef<ComponentRef<typeof CameraView>>(null);
  const recordingStartedAtRef = useRef(0);
  const uploadUuidRef = useRef<string | null>(null);
  const uploadOffsetRef = useRef(0);
  const localFileRef = useRef<File | null>(null);
  const durationMsRef = useRef(0);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const permissionRequestStartedRef = useRef(false);
  const requestPermissionRef = useRef(requestPermission);
  requestPermissionRef.current = requestPermission;

  const removeLocalFile = useCallback(() => {
    const file = localFileRef.current;
    localFileRef.current = null;
    if (file?.exists) file.delete();
  }, []);

  const deleteUnfinishedUpload = useCallback(async () => {
    const uploadUuid = uploadUuidRef.current;
    uploadUuidRef.current = null;
    if (!uploadUuid) return;
    try {
      await deletePrivateAttemptUpload(uploadUuid);
    } catch {
      // The backend's stale-upload cleanup remains the final safety net.
    }
  }, []);

  const finishCancellation = useCallback(async () => {
    removeLocalFile();
    await deleteUnfinishedUpload();
    onClose();
  }, [deleteUnfinishedUpload, onClose, removeLocalFile]);

  useEffect(() => {
    if (!visible) return;
    cancelledRef.current = false;
    uploadUuidRef.current = null;
    localFileRef.current = null;
    durationMsRef.current = 0;
    recordingStartedAtRef.current = 0;
    permissionRequestStartedRef.current = false;
    setElapsedMs(0);
    setProgress(0);
    setErrorCode('default');
    setPhase('permission');
  }, [visible]);

  useEffect(() => {
    if (
      !visible ||
      phase !== 'permission' ||
      !permissionLoaded ||
      permissionGranted ||
      permissionRequestStartedRef.current
    )
      return;
    permissionRequestStartedRef.current = true;
    if (canAskForPermission) {
      void requestPermissionRef.current().then((result) => {
        if (!result.granted) {
          setErrorCode('default');
          setPhase('error');
        }
      });
    } else {
      setErrorCode('default');
      setPhase('error');
    }
  }, [canAskForPermission, permissionGranted, permissionLoaded, phase, visible]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => setElapsedMs(Date.now() - recordingStartedAtRef.current), 250);
    return () => clearInterval(timer);
  }, [phase]);

  const uploadAndFinalize = useCallback(
    async (file: File, uploadUuid: string, offset: number) => {
      abortRef.current = new AbortController();
      setPhase('uploading');
      setProgress(file.size > 0 ? offset / file.size : 0);
      uploadOffsetRef.current = await uploadPrivateAttemptFile(
        uploadUuid,
        file,
        offset,
        (uploaded, total) => setProgress(total > 0 ? uploaded / total : 0),
        abortRef.current.signal,
      );
      if (cancelledRef.current) return;
      setPhase('finalizing');
      await finalizePrivateAttemptUpload(uploadUuid, durationMsRef.current);
      uploadUuidRef.current = null;
      removeLocalFile();
      setPhase('saved');
      onSaved();
    },
    [onSaved, removeLocalFile],
  );

  const handleStart = useCallback(async () => {
    if (!target || !cameraRef.current || phase !== 'ready') return;
    cancelledRef.current = false;
    setErrorCode('default');

    try {
      const created = await createPrivateAttemptUpload({
        clientRecordingId: randomUUID(),
        climbUuid: target.climbUuid,
        layoutId: 3,
        angle: target.angle,
        isMirror: target.isMirror,
        boardId: null,
        sessionId: target.sessionId,
        mimeType: 'video/mp4',
        recordedAt: new Date().toISOString(),
      });
      uploadUuidRef.current = created.video.uuid;
      uploadOffsetRef.current = created.uploadOffset;
      recordingStartedAtRef.current = Date.now();
      setPhase('recording');

      const recording = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SECONDS,
        maxFileSize: MAX_FILE_SIZE,
      });
      durationMsRef.current = Math.max(1, Date.now() - recordingStartedAtRef.current);
      recordingStartedAtRef.current = 0;
      setElapsedMs(durationMsRef.current);

      if (!recording?.uri) throw new PrivateAttemptApiError('RECORDER_FAILED', 'Recording stopped', 500);
      localFileRef.current = new File(recording.uri);
      if (cancelledRef.current) {
        await finishCancellation();
        return;
      }
      setPhase('stopping');
      await uploadAndFinalize(localFileRef.current, created.video.uuid, created.uploadOffset);
    } catch (error) {
      if (cancelledRef.current) {
        await finishCancellation();
        return;
      }
      console.warn('[AttemptRecorder] Recording failed', error);
      setErrorCode(error instanceof PrivateAttemptApiError ? error.code : 'default');
      setPhase('error');
    }
  }, [finishCancellation, phase, target, uploadAndFinalize]);

  const handleStop = useCallback(() => {
    if (phase !== 'recording') return;
    setPhase('stopping');
    cameraRef.current?.stopRecording();
  }, [phase]);

  const handleCancel = useCallback(async () => {
    if (['uploading', 'finalizing', 'cancelling'].includes(phase)) return;
    if (phase === 'saved') {
      onClose();
      return;
    }
    cancelledRef.current = true;
    setPhase('cancelling');
    abortRef.current?.abort();
    if ((phase === 'recording' || phase === 'stopping') && cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch {
        await finishCancellation();
      }
      return;
    }
    await finishCancellation();
  }, [finishCancellation, onClose, phase]);

  const handleRetry = useCallback(async () => {
    const file = localFileRef.current;
    const uploadUuid = uploadUuidRef.current;
    if (!file?.exists || !uploadUuid) {
      await deleteUnfinishedUpload();
      permissionRequestStartedRef.current = false;
      setPhase(permission?.granted ? 'ready' : 'permission');
      return;
    }
    try {
      const status = await getPrivateAttemptUpload(uploadUuid);
      await uploadAndFinalize(file, uploadUuid, status.uploadOffset);
    } catch (error) {
      setErrorCode(error instanceof PrivateAttemptApiError ? error.code : 'default');
      setPhase('error');
    }
  }, [deleteUnfinishedUpload, permission?.granted, uploadAndFinalize]);

  const statusLabel =
    phase === 'uploading'
      ? `${Math.round(progress * 100)}%`
      : phase === 'saved'
        ? t('attemptRecorder.saved')
        : phase === 'error'
          ? t(`attemptRecorder.errors.${errorCode}`, { defaultValue: t('attemptRecorder.errors.default') })
          : phase === 'recording'
            ? formatElapsed(elapsedMs)
            : t(`attemptRecorder.status.${phase}`, { defaultValue: '' });
  const busy = ['stopping', 'uploading', 'finalizing', 'cancelling'].includes(phase);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleCancel}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="video"
            mute
            videoQuality="720p"
            onCameraReady={() => setPhase((current) => (current === 'permission' ? 'ready' : current))}
            onMountError={() => setPhase('error')}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.permissionFallback]}>
            <Icon name="camera" size={52} color={systemColors.secondaryLabel} />
          </View>
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={handleCancel}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('attemptRecorder.closeAria')}
            style={styles.iconButton}
          >
            <Icon name="close" size={26} color="#FFFFFF" />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text variant="headline" color="#FFFFFF" numberOfLines={1}>
              {target?.climbName}
            </Text>
            <Text variant="caption1" color="rgba(255,255,255,0.78)">
              {target?.angle}°
            </Text>
          </View>
          <View style={styles.iconButton} />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
          <Text variant="headline" color="#FFFFFF" style={styles.status}>
            {statusLabel}
          </Text>
          {busy ? <ActivityIndicator color="#FFFFFF" size="large" /> : null}
          {phase === 'ready' ? (
            <Pressable
              onPress={() => void handleStart()}
              accessibilityRole="button"
              accessibilityLabel={t('attemptRecorder.startAria')}
              style={[styles.recordButton, { borderColor: '#FFFFFF' }]}
            >
              <View style={[styles.recordButtonInner, { backgroundColor: brandColors.error }]} />
            </Pressable>
          ) : null}
          {phase === 'recording' ? (
            <Pressable
              onPress={handleStop}
              accessibilityRole="button"
              accessibilityLabel={t('attemptRecorder.stopAria')}
              style={[styles.recordButton, { borderColor: '#FFFFFF' }]}
            >
              <View style={[styles.stopButtonInner, { backgroundColor: brandColors.error }]} />
            </Pressable>
          ) : null}
          {phase === 'error' ? (
            <Pressable
              onPress={() => void handleRetry()}
              style={[styles.commandButton, { backgroundColor: '#FFFFFF' }]}
            >
              <Text variant="headline" color="#000000">
                {localFileRef.current?.exists ? t('attemptRecorder.retryUpload') : t('attemptRecorder.retryCamera')}
              </Text>
            </Pressable>
          ) : null}
          {phase === 'saved' ? (
            <Pressable onPress={onClose} style={[styles.commandButton, { backgroundColor: '#FFFFFF' }]}>
              <Text variant="headline" color="#000000">
                {t('attemptRecorder.done')}
              </Text>
            </Pressable>
          ) : null}
          {phase === 'recording' ? (
            <Pressable onPress={() => void handleCancel()} accessibilityRole="button">
              <Text variant="headline" color="#FFFFFF">
                {t('attemptRecorder.cancelRecording')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  permissionFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111111' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 96,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  titleBlock: { flex: 1, alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 210,
    paddingTop: 20,
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  status: { minHeight: 24, textAlign: 'center', paddingHorizontal: 20 },
  recordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonInner: { width: 60, height: 60, borderRadius: 30 },
  stopButtonInner: { width: 32, height: 32, borderRadius: 6 },
  commandButton: { minHeight: 48, minWidth: 140, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
