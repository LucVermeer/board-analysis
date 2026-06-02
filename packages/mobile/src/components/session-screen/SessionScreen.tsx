import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueue } from '../../providers/queue-provider';
import { SessionScreenHeader } from './SessionScreenHeader';
import { PreSessionView } from './pre-session/PreSessionView';
import { InSessionView } from './in-session/InSessionView';

type SessionScreenProps = {
  onClose: () => void;
};

/**
 * Top-level body of the session overlay. Picks between the pre-session
 * configuration form and the in-session live view based on whether the
 * QueueContext currently holds an active sessionId.
 */
export function SessionScreen({ onClose }: SessionScreenProps) {
  const { sessionId } = useQueue();
  const insets = useSafeAreaInsets();

  const sessionActive = sessionId !== null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <SessionScreenHeader onClose={onClose} sessionActive={sessionActive} />
      <View style={styles.body}>{sessionActive ? <InSessionView /> : <PreSessionView />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
