import { type ReactNode, isValidElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useTheme } from '../../providers/theme-provider';
import { useActiveBoard } from '../../lib/graphql/use-active-board';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { shadows } from '../../theme/tokens';
import { Icon } from '../Icon';
import { GlassSurface } from '../GlassSurface';
import { BoardPill } from './BoardPill';
import { GlassActionToolbar, GlassToolbarAction, TOP_ACTION_SIZE } from './GlassActionToolbar';
import { AngleToolbarAction } from './AngleToolbarAction';
import { LightbulbToolbarAction } from './LightbulbToolbarAction';
import { CollapsingLargeTitleHeader } from './CollapsingLargeTitleHeader';
import { UserAvatarToolbarAction } from '../user-drawer/UserAvatarToolbarAction';

const TOP_TOOLBAR_RADIUS = TOP_ACTION_SIZE / 2;

type CollapsingTopChromeProps = {
  /** Gate the create action (left island). */
  canCreate: boolean;
  /** The screen's defining create action. */
  onCreate: () => void;
  /** VoiceOver label for the create action (namespace differs per screen). */
  createAccessibilityLabel: string;
  /** Open the full board switcher; the board pill doubles as the board filter. */
  onOpenBoardSwitcher: () => void;
  /** Optional VoiceOver hint for the board pill. */
  boardPillAccessibilityHint?: string;
  /** Report the measured chrome height so the list can inset its top padding. */
  onHeightChange: (height: number) => void;
  /** List scroll offset — only needed alongside `collapsedInlineTitle` (Climbs). */
  scrollY?: SharedValue<number>;
  /** Optional plain inline title shown once scrolled (Climbs filter summary). */
  collapsedInlineTitle?: string;
  /** Optional glass action(s) docked at the far right of the right toolbar (e.g. the
   *  Record tab's share/invite + End controls). Discover/Climbs pass none. */
  trailingAction?: ReactNode;
  /** Number of action slots `trailingAction` occupies, so the right toolbar sizes
   *  correctly when it carries more than one glyph (e.g. share + End). Defaults to
   *  1 when `trailingAction` is a single element, 0 otherwise — a fragment of N
   *  actions must pass its real count so the island doesn't clip to one slot. */
  trailingActionCount?: number;
  /** Glass action docked at the LEFT of the islands row, inside the left island
   *  before the create/angle controls (e.g. the Record tab's in-session invite). */
  leadingAction?: ReactNode;
  /** Number of slots `leadingAction` occupies (defaults to 1 for a single element). */
  leadingActionCount?: number;
  /** Suppress the bluetooth lightbulb in the right toolbar — e.g. the active-session
   *  header, which keeps only the stop control on the right. */
  hideLight?: boolean;
  /** Extra controls rendered below the islands row (e.g. the Climbs search row).
   *  Discover passes none. Measured into the reported chrome height. */
  children?: ReactNode;
};

/**
 * Shared floating glass chrome — a centred board pill flanked by angle / create /
 * light islands over an always-on progressive blur. The board pill and islands
 * stay put; the screen's large in-body title simply scrolls away under the blur.
 * Climbs additionally passes `collapsedInlineTitle` (its filter summary), which
 * cross-fades in as plain text once scrolled.
 *
 * Composes the board-agnostic `CollapsingLargeTitleHeader` and supplies the board
 * pill as the centre content. Used by Discover (`DiscoverTopChrome`), Climbs
 * (`ClimbTopChrome`, which adds a search row via `children` + the inline title),
 * and Record (`RecordTopChrome`, which adds a share `trailingAction`).
 */
export function CollapsingTopChrome({
  canCreate,
  onCreate,
  createAccessibilityLabel,
  onOpenBoardSwitcher,
  boardPillAccessibilityHint,
  onHeightChange,
  scrollY,
  collapsedInlineTitle,
  trailingAction,
  trailingActionCount,
  leadingAction,
  leadingActionCount,
  hideLight = false,
  children,
}: CollapsingTopChromeProps) {
  const { systemColors } = useTheme();
  const nativeGlass = useNativeGlass();
  const { data: activeBoard } = useActiveBoard();
  const bluetooth = useOptionalBluetoothContext();

  const canOpenAngle = activeBoard?.isAngleAdjustable !== false && activeBoard?.angle != null;
  // A fragment/element of leading actions reads as one element, so callers passing
  // several supply the explicit count; otherwise reserve a slot only for a real one.
  const leadingActions = leadingActionCount ?? (isValidElement(leadingAction) ? 1 : 0);
  const leftActionCount = 1 + leadingActions + (canCreate ? 1 : 0) + (canOpenAngle ? 1 : 0);

  // The right glass toolbar holds the lightbulb (and an optional trailing action).
  // It's a fixed-width island now (the board never docks here). The lightbulb is
  // hidden when `hideLight` (e.g. the active-session header).
  const lightActions = bluetooth && !hideLight ? 1 : 0;
  // Reserve a slot only for a real element — a `false`/`null` from a `cond && <…>`
  // caller must not widen the toolbar by a phantom 48px. Callers passing a fragment
  // of several actions supply `trailingActionCount` explicitly.
  const trailingActions = trailingActionCount ?? (isValidElement(trailingAction) ? 1 : 0);
  const rightActionCount = lightActions + trailingActions;
  const rightToolbarWidth = rightActionCount * TOP_ACTION_SIZE;

  const leftActions = (
    <GlassActionToolbar actionCount={leftActionCount}>
      <UserAvatarToolbarAction variant="glass" />
      {leadingAction}
      {canCreate ? (
        <GlassToolbarAction onPress={onCreate} accessibilityLabel={createAccessibilityLabel}>
          <Icon name="plus" size={24} color={systemColors.label} />
        </GlassToolbarAction>
      ) : null}
      <AngleToolbarAction />
    </GlassActionToolbar>
  );

  // Right glass toolbar: lightbulb (+ optional trailing action), fixed width.
  const rightActions =
    rightToolbarWidth > 0 ? (
      <View
        style={[
          styles.rightToolbar,
          { width: rightToolbarWidth },
          !nativeGlass && shadows.sm,
          !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
        ]}
      >
        <GlassSurface
          glassEffectStyle="regular"
          fallbackColor={systemColors.elevatedSurface}
          borderRadius={TOP_TOOLBAR_RADIUS}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {bluetooth && !hideLight ? <LightbulbToolbarAction /> : null}
        {trailingAction}
      </View>
    ) : null;

  return (
    <CollapsingLargeTitleHeader
      scrollY={scrollY}
      collapsedInlineTitle={collapsedInlineTitle}
      onHeightChange={onHeightChange}
      leftActions={leftActions}
      rightActions={rightActions}
      centerContent={<BoardPill onPress={onOpenBoardSwitcher} accessibilityHint={boardPillAccessibilityHint} />}
    >
      {children}
    </CollapsingLargeTitleHeader>
  );
}

const styles = StyleSheet.create({
  rightToolbar: {
    height: TOP_ACTION_SIZE,
    borderRadius: TOP_TOOLBAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
});
