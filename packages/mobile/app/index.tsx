import { Redirect } from 'expo-router';
import { useActiveBoard } from '../src/lib/graphql/use-active-board';

/**
 * App launcher route. Pick the default tab only when the user opens the app root;
 * explicit tab routes (join -> Record, deep links, etc.) must keep their target.
 */
export default function MobileHome() {
  const { data: activeBoard, isLoading } = useActiveBoard();

  if (isLoading) return null;

  return <Redirect href={activeBoard ? '/(tabs)/climbs' : '/(tabs)/boards'} />;
}
