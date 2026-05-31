'use client';

import React, { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import MuiButton from '@mui/material/Button';
import { useSearchParams } from 'next/navigation';
import { track } from '@/app/lib/analytics';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';
import type { Climb, BoardDetails, Angle } from '@/app/lib/types';
import { useQueueActions, useCurrentClimb, useQueueList } from '@/app/components/graphql-queue';
import SwipeBoardCarousel from '@/app/components/board-renderer/swipe-board-carousel';
import { useClimbFrames } from '@/app/components/board-renderer/util';
import ClimbTitle from '@/app/components/climb-card/climb-title';
import { AscentStatus } from '@/app/components/climb-card/ascent-status';
import { constructClimbListWithSlugs, constructPlayUrlWithSlugs, extractUuidFromSlug } from '@/app/lib/url-utils';
import { themeTokens } from '@/app/theme/theme-config';
import { EmptyState } from '@/app/components/ui/empty-state';
import PlayViewComments from '@/app/components/play-view/play-view-comments';
import { usePlaybackEngine, type ExternalPlaybackState } from '@/app/components/playback/use-playback-engine';
import { PlaybackControls } from '@/app/components/playback/playback-controls';
import { BluetoothContext } from '@/app/components/board-bluetooth-control/bluetooth-context';
import { usePersistentSessionActions } from '@/app/components/persistent-session';
import styles from './play-view.module.css';

type PlayViewClientProps = {
  boardDetails: BoardDetails;
  initialClimb: Climb | null;
  angle: Angle;
};

const PlayViewClient: React.FC<PlayViewClientProps> = ({ boardDetails, initialClimb, angle }) => {
  const { t } = useTranslation('session');
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const { currentClimb } = useCurrentClimb();
  const { queue } = useQueueList();
  const { setCurrentClimbQueueItem, getNextClimbQueueItem, getPreviousClimbQueueItem } = useQueueActions();

  // Use queue's current climb if available (has real-time state like mirrored),
  // otherwise fall back to the initial climb from SSR.
  const displayClimb = currentClimb || initialClimb;

  // Get the mirrored state from currentClimb when it matches the displayed climb
  const isMirrored = currentClimb?.uuid === displayClimb?.uuid ? !!currentClimb?.mirrored : !!displayClimb?.mirrored;

  // Sync queue state with URL on browser back/forward navigation.
  // Uses refs to avoid re-subscribing the listener on every queue change.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const setCurrentClimbRef = useRef(setCurrentClimbQueueItem);
  setCurrentClimbRef.current = setCurrentClimbQueueItem;

  useEffect(() => {
    const handlePopState = () => {
      const pathSegments = window.location.pathname.split('/');
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (!lastSegment) return;
      const uuid = extractUuidFromSlug(lastSegment);
      const item = queueRef.current.find((i) => i.climb.uuid === uuid);
      if (item) {
        setCurrentClimbRef.current(item);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const getBackToListUrl = useCallback(() => {
    const { board_name, layout_name, size_name, size_description, set_names } = boardDetails;

    let baseUrl: string;
    if (layout_name && size_name && set_names) {
      baseUrl = constructClimbListWithSlugs(board_name, layout_name, size_name, size_description, set_names, angle);
    } else {
      baseUrl = `/${board_name}/${boardDetails.layout_id}/${boardDetails.size_id}/${boardDetails.set_ids.join(',')}/${angle}/list`;
    }

    const queryString = searchParams.toString();
    if (queryString) {
      return `${baseUrl}?${queryString}`;
    }
    return baseUrl;
  }, [boardDetails, angle, searchParams]);

  const navigateToClimb = useCallback(
    (climb: Climb) => {
      const { board_name, layout_name, size_name, size_description, set_names } = boardDetails;

      let url: string;
      if (layout_name && size_name && set_names) {
        url = constructPlayUrlWithSlugs(
          board_name,
          layout_name,
          size_name,
          size_description,
          set_names,
          angle,
          climb.uuid,
          climb.name,
        );
      } else {
        url = `/${board_name}/${boardDetails.layout_id}/${boardDetails.size_id}/${boardDetails.set_ids.join(',')}/${angle}/play/${climb.uuid}`;
      }

      const queryString = searchParams.toString();
      if (queryString) {
        url = `${url}?${queryString}`;
      }
      window.history.pushState(null, '', url);
    },
    [boardDetails, angle, searchParams],
  );

  const handleNext = useCallback(() => {
    const nextItem = getNextClimbQueueItem();
    if (nextItem) {
      setCurrentClimbQueueItem(nextItem);
      navigateToClimb(nextItem.climb);
      track('Play Mode Navigation', {
        direction: 'next',
        boardLayout: boardDetails.layout_name || '',
      });
    }
  }, [getNextClimbQueueItem, setCurrentClimbQueueItem, navigateToClimb, boardDetails.layout_name]);

  const handlePrevious = useCallback(() => {
    const prevItem = getPreviousClimbQueueItem();
    if (prevItem) {
      setCurrentClimbQueueItem(prevItem);
      navigateToClimb(prevItem.climb);
      track('Play Mode Navigation', {
        direction: 'previous',
        boardLayout: boardDetails.layout_name || '',
      });
    }
  }, [getPreviousClimbQueueItem, setCurrentClimbQueueItem, navigateToClimb, boardDetails.layout_name]);

  const nextItem = getNextClimbQueueItem();
  const prevItem = getPreviousClimbQueueItem();

  // Decode multi-frame climbs once per `frames` text so the engine doesn't
  // rebuild on every render. Single-frame climbs produce frameStrings of
  // length 1 and the engine short-circuits.
  const climbFrames = useClimbFrames(displayClimb, boardDetails.board_name);
  const playbackClientId = useId();
  const bluetooth = useContext(BluetoothContext);
  const sendFramesToBoard = bluetooth?.sendFramesToBoard;
  const isBleConnected = bluetooth?.isConnected ?? false;
  const isMirroredRef = useRef(isMirrored);
  isMirroredRef.current = isMirrored;

  const { publishPlaybackState, subscribeToQueueEvents } = usePersistentSessionActions();

  // Inbound peer playback events for the active climb. The engine watches
  // this state and converges; events for other climbs are ignored.
  const [externalPlayback, setExternalPlayback] = useState<ExternalPlaybackState | null>(null);
  const activeClimbUuid = displayClimb?.uuid;
  useEffect(() => {
    setExternalPlayback(null);
  }, [activeClimbUuid]);
  useEffect(() => {
    if (!activeClimbUuid) return;
    const unsubscribe = subscribeToQueueEvents((event) => {
      if (event.__typename !== 'PlaybackStateChanged') return;
      if (event.climbUuid !== activeClimbUuid) return;
      setExternalPlayback({
        frameIndex: event.frameIndex,
        isPlaying: event.isPlaying,
        speed: event.speed,
        paceMs: event.paceMs,
        anchorTimestamp: Number(event.anchorTimestamp),
        clientId: event.clientId,
      });
    });
    return unsubscribe;
  }, [activeClimbUuid, subscribeToQueueEvents]);

  const handleLocalPlaybackChange = useCallback(
    (state: ExternalPlaybackState) => {
      if (!activeClimbUuid) return;
      void publishPlaybackState({
        climbUuid: activeClimbUuid,
        frameIndex: state.frameIndex,
        isPlaying: state.isPlaying,
        speed: state.speed,
        paceMs: state.paceMs,
        // Forward the engine's own clientId so the server can echo it back on
        // `PlaybackStateChanged`. Without this the server falls back to the
        // WebSocket connection id, which lives in a different namespace from
        // useId() and breaks echo suppression for the publisher's own clients.
        clientId: playbackClientId,
      });
    },
    [activeClimbUuid, publishPlaybackState, playbackClientId],
  );

  const playback = usePlaybackEngine({
    frames: climbFrames.frames,
    frameStrings: climbFrames.frameStrings,
    paceMs: climbFrames.paceMs,
    clientId: playbackClientId,
    externalState: externalPlayback,
    onLocalStateChange: handleLocalPlaybackChange,
  });

  // Mirror engine ticks to the connected board. AutoSender only writes the
  // first frame for multi-frame climbs (see bluetooth-context.tsx); the
  // engine takes over from frame 1 onward and after every seek.
  //
  // Latest-wins serialization: Web Bluetooth on Android can't actually
  // cancel an in-flight GATT operation, so a second `sendFramesToBoard`
  // call started before the previous one resolves throws "GATT operation
  // already in progress." If the engine advances faster than BLE flushes
  // (short paceMs + a slow link), naively writing on every effect run
  // would cascade into failures. Same pattern as BluetoothAutoSender:
  // while a write is in flight, store the most recent pending frame; when
  // the current write resolves, drain whatever's latest and repeat.
  const isWritingFrameRef = useRef(false);
  const pendingFrameRef = useRef<string | null>(null);
  const lastSentFrameRef = useRef<string | null>(null);
  useEffect(() => {
    lastSentFrameRef.current = null;
    pendingFrameRef.current = null;
  }, [displayClimb?.uuid]);
  useEffect(() => {
    if (!isBleConnected || !sendFramesToBoard) return;
    if (!playback.isAnimatable) return;
    const frame = playback.currentFrameString;
    if (!frame) return;
    if (frame === lastSentFrameRef.current) return;
    if (isWritingFrameRef.current) {
      pendingFrameRef.current = frame;
      return;
    }
    isWritingFrameRef.current = true;
    const drain = async () => {
      let toSend: string | null = frame;
      try {
        while (toSend !== null) {
          const next = toSend;
          if (next === lastSentFrameRef.current) {
            toSend = pendingFrameRef.current;
            pendingFrameRef.current = null;
            continue;
          }
          lastSentFrameRef.current = next;
          try {
            await sendFramesToBoard(next, isMirroredRef.current, undefined, displayClimb?.uuid);
          } catch (error) {
            console.error('[PlayView] BLE frame send failed:', error);
          }
          toSend = pendingFrameRef.current;
          pendingFrameRef.current = null;
        }
      } finally {
        isWritingFrameRef.current = false;
      }
    };
    void drain();
  }, [isBleConnected, sendFramesToBoard, playback.isAnimatable, playback.currentFrameString, displayClimb?.uuid]);

  if (!displayClimb) {
    return (
      <div className={styles.pageContainer} style={{ backgroundColor: 'var(--semantic-background)' }}>
        <div className={styles.emptyState} style={{ color: 'var(--neutral-400)' }}>
          <EmptyState description={t('playView.noClimbSelected')} />
          <MuiButton variant="contained" onClick={() => router.push(getBackToListUrl())}>
            {t('playView.browseClimbs')}
          </MuiButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer} style={{ backgroundColor: 'var(--semantic-background)' }}>
      {/* Main Content with Swipe */}
      <div className={styles.contentWrapper}>
        {/* Climb title - horizontal layout with grade on right */}
        <div
          className={styles.climbTitleContainer}
          style={{
            padding: `${themeTokens.spacing[1]}px ${themeTokens.spacing[3]}px`,
          }}
        >
          <ClimbTitle
            climb={displayClimb}
            layout="horizontal"
            showSetterInfo
            titleFontSize={themeTokens.typography.fontSize['2xl']}
            rightAddon={
              displayClimb && (
                <AscentStatus
                  climbUuid={displayClimb.uuid}
                  angle={angle}
                  fontSize={themeTokens.typography.fontSize['2xl']}
                />
              )
            }
            isNoMatch={!!displayClimb?.is_no_match}
          />
        </div>
        <SwipeBoardCarousel
          boardDetails={boardDetails}
          currentClimb={{
            // For multi-frame climbs render the active snapshot so the
            // on-screen board tracks the playback engine; single-frame
            // climbs fall back to the original full frames string and
            // behave exactly as before.
            frames: playback.isAnimatable ? playback.currentFrameString : displayClimb.frames,
            mirrored: isMirrored,
          }}
          zoomResetKey={displayClimb.uuid}
          nextClimb={nextItem?.climb}
          previousClimb={prevItem?.climb}
          onSwipeNext={handleNext}
          onSwipePrevious={handlePrevious}
          canSwipeNext={!!nextItem}
          canSwipePrevious={!!prevItem}
          className={styles.swipeContainer}
          boardContainerClassName={styles.boardContainer}
        />
      </div>

      {/* Playback controls sit OUTSIDE contentWrapper so the swipe carousel
          (flex:1 inside an overflow:hidden parent) can never clip them. */}
      {playback.isAnimatable && (
        <PlaybackControls
          frameIndex={playback.frameIndex}
          frameCount={climbFrames.frameStrings.length}
          isPlaying={playback.isPlaying}
          speed={playback.speed}
          paceMs={climbFrames.paceMs}
          onPlay={playback.play}
          onPause={playback.pause}
          onSeek={playback.seek}
          onSpeedChange={playback.setSpeed}
        />
      )}

      {/* Comments */}
      <div className={styles.extrasSection}>
        <PlayViewComments climbUuid={displayClimb.uuid} />
      </div>
    </div>
  );
};

export default PlayViewClient;
