// The toolbar's right-hand log-ascent FAB. A glass circle that opens the
// LogAscentSheet for the current climb, tinted by whether the climb is already
// logged, and popping once with a celebratory spring the moment a fresh
// send/flash lands. Extracted so both the global toolbar (and any future host)
// render an identical, HIG-sized tick.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/queue';
import { useOptionalBoardProvider } from '@boardsesh/board-react';
import { GlassIconButton } from '../GlassIconButton';
import { useTheme } from '../../providers/theme-provider';
import { useQueue } from '../../providers/queue-provider';
import { useDrawerHost } from '../../providers/drawer-host-provider';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { withAlpha } from '../../theme/colors';
import { springs } from '../../theme/animations';
import { hapticSelection } from '../../lib/haptics';
import { countSentAscents } from '../../lib/ascent-status-utils';
import { TOOLBAR_FAB_SIZE } from '../../theme/layout';

type LogAscentFabProps = {
  climb: Climb;
  size?: number;
};

export function LogAscentFab({ climb, size = TOOLBAR_FAB_SIZE }: LogAscentFabProps) {
  const { t } = useTranslation('session');
  const { systemColors, brandColors } = useTheme();
  const { boardConfig, openLogAscent } = useDrawerHost();
  const { sessionId } = useQueue();
  const board = useOptionalBoardProvider();
  const reduceMotion = useReduceMotion();

  const angle = climb.angle;
  const isMirror = climb.mirrored === true;

  // Count of send/flash ticks for this climb at this angle — the same logbook
  // selector AscentStatusBadge uses, so the toolbar and the list badge agree.
  const sentCount = useMemo(
    () => (board ? countSentAscents(board.logbook, climb.uuid, angle) : 0),
    [board, climb.uuid, angle],
  );
  const isLogged = sentCount > 0;

  // Make sure the current climb's ticks are loaded, even when it isn't one of
  // the visible list rows the screen already fetched, so the ticked-state is
  // accurate on every tab.
  useEffect(() => {
    if (board && climb.uuid) void board.getLogbook([climb.uuid]);
  }, [board, climb.uuid]);

  // Success burst: pop once when a fresh send/flash lands for the climb the user
  // just ticked. `pendingRef` (armed on press) gates out the false positive of
  // the logbook simply finishing its initial load for an already-logged climb,
  // and the baseline resets per climb so switching to a logged climb never pops.
  const pop = useSharedValue(1);
  const pendingRef = useRef(false);
  const baselineRef = useRef<{ uuid: string; count: number } | null>(null);
  useEffect(() => {
    const baseline = baselineRef.current;
    if (!baseline || baseline.uuid !== climb.uuid) {
      baselineRef.current = { uuid: climb.uuid, count: sentCount };
      pendingRef.current = false;
      return;
    }
    if (sentCount > baseline.count) {
      if (pendingRef.current && !reduceMotion) {
        pop.value = withSequence(withSpring(1.18, springs.bouncy), withSpring(1, springs.snappy));
      }
      pendingRef.current = false;
    }
    baselineRef.current = { uuid: climb.uuid, count: sentCount };
  }, [climb.uuid, sentCount, reduceMotion, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const handleTick = useCallback(() => {
    if (!boardConfig) return;
    pendingRef.current = true;
    hapticSelection();
    openLogAscent({
      climbUuid: climb.uuid,
      boardName: boardConfig.boardName,
      angle,
      isMirror,
      isBenchmark: climb.benchmark_difficulty != null,
      layoutId: boardConfig.layoutId,
      sizeId: boardConfig.sizeId,
      setIds: boardConfig.setIds,
      sessionId,
      consensusGradeName: climb.difficulty,
    });
  }, [openLogAscent, boardConfig, sessionId, climb, angle, isMirror]);

  // Neutral glass at rest — matching the search + create FABs — and green only
  // when logged (the lasting "you sent this" signal). The solid fallback is a
  // touch stronger so the green still reads on the Android / Reduce-Transparency
  // no-glass path, where a low-alpha tint over a light surface barely registers.
  const tintColor = isLogged ? withAlpha(brandColors.success, 0.3) : undefined;
  const fallbackColor = isLogged ? withAlpha(brandColors.success, 0.4) : systemColors.fill;

  const baseLabel = t('mobile.queue.logAscent');
  const accessibilityLabel = isLogged ? `${baseLabel}, ${t('mobile.queue.alreadyLogged')}` : baseLabel;

  return (
    <Animated.View style={popStyle}>
      <GlassIconButton
        iconName="tick"
        iconColor={systemColors.label as string}
        iconSize={26}
        onPress={handleTick}
        disabled={!boardConfig}
        accessibilityLabel={accessibilityLabel}
        tintColor={tintColor}
        fallbackColor={fallbackColor}
        size={size}
      />
    </Animated.View>
  );
}
