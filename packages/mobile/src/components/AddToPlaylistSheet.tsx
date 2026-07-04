import { useMemo, type ComponentType } from 'react';
import { type TextInputProps } from 'react-native';
import { BottomSheetTextInput } from '@expo/ui/community/bottom-sheet';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import { ModalSheet } from './ModalSheet';
import { ClimbPreviewCard } from './ClimbPreviewCard';
import { InlinePlaylistPicker } from './playlist/InlinePlaylistPicker';

type AddToPlaylistSheetProps = {
  visible: boolean;
  climb: Climb | null;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  /** Request an animated close (pan-down). */
  onClose: () => void;
  /** Fired once the dismiss animation has settled — safe to unmount/clear.
   * Optional: always-mounted hosts don't unmount, so they may omit it. */
  onFullyDismissed?: () => void;
};

// The native bottom-sheet text input pushes the sheet up for the keyboard; the
// reaction overlay injects the plain RN TextInput instead. Both satisfy the
// picker's TextInputProps contract.
const SheetTextInput = BottomSheetTextInput as unknown as ComponentType<TextInputProps>;

/**
 * The swipe/ellipsis "Add to playlist" surface. Since #3167 native sheets can't
 * stack, so both the playlist list AND the create-new form live INLINE in this
 * one sheet (`InlinePlaylistPicker`) — no nested sheet to be dismissed on
 * present. The reaction overlay reuses the same picker without a sheet at all.
 */
function AddToPlaylistSheet({
  visible,
  climb,
  boardName,
  layoutId,
  sizeId,
  setIds,
  angle,
  onClose,
  onFullyDismissed,
}: AddToPlaylistSheetProps) {
  const snapPoints = useMemo(() => ['50%', '90%'], []);

  return (
    <ModalSheet
      visible={visible && !!climb}
      snapPoints={snapPoints}
      onClose={onClose}
      onFullyDismissed={onFullyDismissed}
      enablePanDownToClose
      scrollable
    >
      {climb && (
        <>
          <ClimbPreviewCard
            climb={climb}
            boardName={boardName}
            layoutId={layoutId}
            sizeId={sizeId}
            setIds={setIds}
            angle={angle}
          />
          <InlinePlaylistPicker
            climb={climb}
            angle={angle}
            boardName={boardName}
            layoutId={layoutId}
            TextInputComponent={SheetTextInput}
          />
        </>
      )}
    </ModalSheet>
  );
}

export { AddToPlaylistSheet };
