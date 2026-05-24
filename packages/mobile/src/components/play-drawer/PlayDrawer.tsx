import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import { randomUUID } from 'expo-crypto';
import { computeNavigationState, boardSupportsMirroring } from '@boardsesh/play-view';
import { BoardRenderer } from '../board-renderer';
import { PlayDrawerHeader } from './PlayDrawerHeader';
import { PlayDrawerActionBar } from './PlayDrawerActionBar';
import { PlayDrawerTickFab } from './PlayDrawerTickFab';
import { LogAscentSheet } from '../LogAscentSheet';
import { Icon } from '../Icon';
import { useQueue } from '../../providers/queue-provider';
import { useToggleFavorite } from '../../lib/graphql/hooks';
import { getBoardRenderData } from '../../lib/board-details';
import { hapticSuccess } from '../../lib/haptics';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type BoardConfig = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

export type PlayDrawerHandle = {
  open: (climb: Climb) => void;
  close: () => void;
};

type PlayDrawerProps = {
  boardConfig: BoardConfig;
};

export const PlayDrawer = forwardRef<PlayDrawerHandle, PlayDrawerProps>(function PlayDrawer(
  { boardConfig },
  ref,
) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [climb, setClimb] = useState<Climb | null>(null);
  const [showLogAscent, setShowLogAscent] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);

  const { state, setCurrentClimb, nextClimb, previousClimb, sessionId } = useQueue();
  const { mutate: toggleFavoriteMutate } = useToggleFavorite();
  const [isFavorited, setIsFavorited] = useState(false);

  const { boardName, layoutId, sizeId, setIds, angle } = boardConfig;

  const boardRenderData = useMemo(() => {
    const parsedSetIds = setIds.split(',').map(Number);
    return getBoardRenderData({
      boardName: boardName as BoardName,
      layoutId,
      sizeId,
      setIds: parsedSetIds,
    });
  }, [boardName, layoutId, sizeId, setIds]);

  const imageUrls = boardRenderData?.imageUrls;
  useEffect(() => {
    if (imageUrls) {
      for (const url of imageUrls) {
        Image.prefetch(url);
      }
    }
  }, [imageUrls]);

  const navigationState = useMemo(
    () => computeNavigationState(state.queue, state.currentClimbQueueItem),
    [state.queue, state.currentClimbQueueItem],
  );

  // Use local climb as primary source until queue state catches up
  const displayedClimb = climb ?? state.currentClimbQueueItem?.climb;

  useImperativeHandle(ref, () => ({
    open: (selectedClimb: Climb) => {
      setClimb(selectedClimb);
      setIsMirrored(false);
      setIsFavorited(false);
      const queueItem = {
        uuid: randomUUID(),
        climb: {
          uuid: selectedClimb.uuid,
          name: selectedClimb.name,
          frames: selectedClimb.frames,
          setter_username: selectedClimb.setter_username,
          angle: selectedClimb.angle,
          ascensionist_count: selectedClimb.ascensionist_count,
          difficulty: selectedClimb.difficulty,
          quality_average: selectedClimb.quality_average,
          stars: selectedClimb.stars,
          difficulty_error: selectedClimb.difficulty_error,
          benchmark_difficulty: selectedClimb.benchmark_difficulty,
          userAscents: selectedClimb.userAscents,
          userAttempts: selectedClimb.userAttempts,
        },
      };
      setCurrentClimb(queueItem);
      sheetRef.current?.snapToIndex(0);
    },
    close: () => {
      sheetRef.current?.close();
    },
  }));

  const handleClose = useCallback(() => {
    setClimb(null);
    setIsMirrored(false);
  }, []);

  const handlePrev = useCallback(() => {
    previousClimb();
    setIsMirrored(false);
  }, [previousClimb]);

  const handleNext = useCallback(() => {
    nextClimb();
    setIsMirrored(false);
  }, [nextClimb]);

  const handleMirror = useCallback(() => {
    setIsMirrored((prev) => !prev);
  }, []);

  const handleToggleFavorite = useCallback(() => {
    if (!displayedClimb) return;
    hapticSuccess();
    setIsFavorited((prev) => !prev);
    toggleFavoriteMutate({
      input: {
        boardName,
        climbUuid: displayedClimb.uuid,
        angle,
      },
    });
  }, [displayedClimb, boardName, angle, toggleFavoriteMutate]);

  const handleLightbulb = useCallback(() => {
    // Phase 5: BLE integration
  }, []);

  const handleOpenActions = useCallback(() => {
    // Phase 3: Climb actions sheet
  }, []);

  const handleOpenQueue = useCallback(() => {
    // Phase 3: Queue drawer
  }, []);

  const handleTickFabPress = useCallback(() => {
    setShowLogAscent(true);
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const snapPoints = useMemo(() => ['95%'], []);

  const ascentCount = displayedClimb?.userAscents ?? 0;
  const supportsMirroring = boardSupportsMirroring(boardName, layoutId);

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={handleClose}
        handleIndicatorStyle={styles.indicator}
        backgroundStyle={styles.background}
      >
        <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom }]}>
          <Pressable
            onPress={() => sheetRef.current?.close()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={styles.closeButton}
          >
            <Icon name="close" size={20} color={iosSystemColors.systemGray} />
          </Pressable>

          {displayedClimb && (
            <>
              <PlayDrawerHeader
                name={displayedClimb.name}
                difficulty={displayedClimb.difficulty}
                qualityAverage={displayedClimb.quality_average}
                ascensionistCount={displayedClimb.ascensionist_count}
                stars={displayedClimb.stars}
                setterUsername={displayedClimb.setter_username}
              />

              <View style={styles.boardSection}>
                {boardRenderData && (
                  <BoardRenderer
                    frames={displayedClimb.frames}
                    boardName={boardName as BoardName}
                    boardWidth={boardRenderData.boardWidth}
                    boardHeight={boardRenderData.boardHeight}
                    imageUrls={boardRenderData.imageUrls}
                    holdsData={boardRenderData.holdsData}
                    mirrored={isMirrored}
                  />
                )}

                <PlayDrawerTickFab
                  ascentCount={ascentCount}
                  onPress={handleTickFabPress}
                />
              </View>

              <PlayDrawerActionBar
                canSwipePrevious={navigationState.canPrevious}
                canSwipeNext={navigationState.canNext}
                isMirrored={isMirrored}
                supportsMirroring={supportsMirroring}
                isFavorited={isFavorited}
                remainingQueueCount={navigationState.remainingCount}
                lightbulbActive={false}
                onPrevClick={handlePrev}
                onNextClick={handleNext}
                onMirror={handleMirror}
                onToggleFavorite={handleToggleFavorite}
                onLightbulb={handleLightbulb}
                onOpenActions={handleOpenActions}
                onOpenQueue={handleOpenQueue}
              />
            </>
          )}
        </BottomSheetView>
      </BottomSheet>

      {displayedClimb && (
        <LogAscentSheet
          visible={showLogAscent}
          onDismiss={() => setShowLogAscent(false)}
          climbUuid={displayedClimb.uuid}
          climbName={displayedClimb.name}
          boardName={boardName}
          angle={angle}
          isMirror={isMirrored}
          isBenchmark={displayedClimb.benchmark_difficulty != null}
          layoutId={layoutId}
          sizeId={sizeId}
          setIds={setIds}
          sessionId={sessionId}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  background: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  content: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardSection: {
    flex: 1,
    position: 'relative',
    marginHorizontal: spacing[4],
  },
});
