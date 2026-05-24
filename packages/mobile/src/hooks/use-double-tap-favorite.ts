import { useState, useCallback, useRef } from 'react';
import { useToggleFavorite } from '../lib/graphql/hooks';

type UseDoubleTapFavoriteParams = {
  climbUuid: string;
  boardName: string;
  angle: number;
  initialFavorited?: boolean;
};

export function useDoubleTapFavorite({
  climbUuid,
  boardName,
  angle,
  initialFavorited = false,
}: UseDoubleTapFavoriteParams) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [showHeart, setShowHeart] = useState(false);
  const isFavoritedRef = useRef(initialFavorited);
  isFavoritedRef.current = isFavorited;

  const { mutate: toggleFavorite } = useToggleFavorite();

  const handleDoubleTap = useCallback(() => {
    // Instagram-style: double-tap only adds, never removes
    if (!isFavoritedRef.current) {
      setIsFavorited(true);
      toggleFavorite({ input: { boardName, climbUuid, angle } });
    }
    setShowHeart(true);
  }, [toggleFavorite, boardName, climbUuid, angle]);

  const dismissHeart = useCallback(() => {
    setShowHeart(false);
  }, []);

  return { handleDoubleTap, showHeart, dismissHeart, isFavorited };
}
