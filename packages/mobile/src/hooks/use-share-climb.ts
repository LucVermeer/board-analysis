import { useCallback } from 'react';
import { Share } from 'react-native';
import { buildClimbViewPath } from '@boardsesh/play-view';
import type { Climb } from '@boardsesh/shared-schema';
import { WEB_BASE_URL } from '../lib/env';

type ShareClimbArgs = {
  climb: Climb | null;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

export function useShareClimb({ climb, boardName, layoutId, sizeId, setIds, angle }: ShareClimbArgs) {
  return useCallback(async () => {
    if (!climb) return;
    const url = `${WEB_BASE_URL}${buildClimbViewPath(boardName, layoutId, sizeId, setIds, angle, climb.uuid)}`;
    await Share.share({ message: `${climb.name}\n${url}`, url });
  }, [climb, boardName, layoutId, sizeId, setIds, angle]);
}
