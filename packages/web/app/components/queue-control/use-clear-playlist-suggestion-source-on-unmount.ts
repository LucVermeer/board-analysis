import { useEffect, useRef } from 'react';
import type { QueueActionsType } from './types';

type PlaylistSuggestionSourceActions = Pick<QueueActionsType, 'setPlaylistSuggestionSource'>;

export function useClearPlaylistSuggestionSourceOnUnmount(
  queueActions: PlaylistSuggestionSourceActions | null | undefined,
): void {
  const queueActionsRef = useRef(queueActions);

  useEffect(() => {
    queueActionsRef.current = queueActions;
  }, [queueActions]);

  useEffect(() => {
    return () => {
      queueActionsRef.current?.setPlaylistSuggestionSource(null);
    };
  }, []);
}
