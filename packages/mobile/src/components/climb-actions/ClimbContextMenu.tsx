import { useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import ContextMenu, { type ContextMenuAction } from 'react-native-context-menu-view';
import type { Climb } from '@boardsesh/shared-schema';
import { iconMap } from '../icon-map';
import { useAuth } from '../../providers/auth-provider';
import { useProfile } from '../../lib/graphql/hooks';
import type { BoardConfig } from '../../providers/drawer-host-provider';
import { useClimbActions } from './use-climb-actions';

type ClimbContextMenuProps = {
  /** Null (e.g. a tick whose climb can't be resolved) → passthrough, no menu. */
  climb: Climb | null;
  boardConfig: BoardConfig | null;
  /** Logbook-only: adds an "Edit entry" action wired to the tick editor. */
  onEditEntry?: () => void;
  /** Passthrough (no menu) when the row's climb isn't actionable — e.g. an
   *  unsupported board. */
  disabled?: boolean;
  children: ReactNode;
};

/**
 * iOS long-press → native `UIContextMenu`: the row lifts and floats with the
 * background blurred, and a native menu of the climb actions appears — the
 * iMessage-reaction interaction. Android keeps the bottom sheet (this component is a
 * passthrough off iOS), so it is only mounted by the rows on iOS; the Platform guard
 * is a safety net.
 *
 * The floated preview is the system snapshot of the wrapped row. We deliberately do
 * NOT pass a custom `preview`: `react-native-context-menu-view` doesn't reparent the
 * `preview` child on the React Native New Architecture, so it leaks into the row
 * layout and the board art renders twice. Snapshotting the row is the reliable path
 * (and reuses the row's already-rendered art for free).
 *
 * Actions come from the shared `useClimbActions` hook (the same list the sheet
 * renders), mapped to native menu items with SF Symbols from the app `iconMap`. The
 * native menu dismisses itself, so no `onAfterAction` is passed.
 */
export function ClimbContextMenu({ climb, boardConfig, onEditEntry, disabled, children }: ClimbContextMenuProps) {
  const { isAuthenticated } = useAuth();
  const { data: profile } = useProfile();

  const actions = useClimbActions({
    climb,
    boardConfig,
    currentUserId: profile?.id ?? null,
    isAuthenticated,
    onEditEntry,
  });

  const menuActions = useMemo<ContextMenuAction[]>(
    () =>
      actions.map((action) => ({
        title: action.title,
        systemIcon: iconMap[action.icon].ios,
      })),
    [actions],
  );

  if (Platform.OS !== 'ios' || disabled || !climb || !boardConfig || actions.length === 0) {
    return <>{children}</>;
  }

  return (
    <ContextMenu
      actions={menuActions}
      // Dispatch by index into the same flat list we passed (no submenus).
      onPress={(event) => actions[event.nativeEvent.index]?.run()}
      // Tapping the floated row opens the climb view-only (the "preview" action).
      onPreviewPress={() => actions.find((action) => action.id === 'preview')?.run()}
    >
      {children}
    </ContextMenu>
  );
}
