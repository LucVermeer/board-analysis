import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useAuth } from '../../src/providers/auth-provider';
import { hapticLight } from '../../src/lib/haptics';
import { brandColors } from '../../src/theme/colors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SignInButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 300, mass: 0.7 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 300, mass: 0.7 });
      }}
      style={[animatedStyle, styles.button]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </AnimatedPressable>
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Boardsesh</Text>
        <Text style={styles.subtitle}>One app for your boards</Text>
      </View>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && (
          <SignInButton title="Sign in with Apple" onPress={() => signIn('apple')} />
        )}
        <SignInButton title="Sign in with Google" onPress={() => signIn('google')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
  title: { fontSize: 34, fontWeight: '700', marginBottom: 8, color: brandColors.primary },
  subtitle: { fontSize: 17, opacity: 0.7 },
  buttons: { gap: 12 },
  button: {
    backgroundColor: brandColors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
