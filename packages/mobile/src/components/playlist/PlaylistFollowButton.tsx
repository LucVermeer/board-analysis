import { useTranslation } from 'react-i18next';
import { Button } from '../Button';

type PlaylistFollowButtonProps = {
  isFollowing: boolean;
  onToggle: () => void;
  loading?: boolean;
};

/**
 * Follow / unfollow control for the public playlist-detail header. Mirrors
 * web's `FollowButton`: filled "Follow" → outlined "Following" (tapping again
 * unfollows). The parent owns the optimistic flip + follower-count update.
 */
export function PlaylistFollowButton({ isFollowing, onToggle, loading }: PlaylistFollowButtonProps) {
  const { t } = useTranslation('common');
  return (
    <Button
      title={isFollowing ? t('follow.following') : t('follow.follow')}
      variant={isFollowing ? 'outlined' : 'filled'}
      size="small"
      onPress={onToggle}
      loading={loading}
    />
  );
}
