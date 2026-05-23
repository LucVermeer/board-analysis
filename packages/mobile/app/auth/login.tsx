import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/providers/auth-provider';
import { hapticLight } from '../../src/lib/haptics';
import { brandColors } from '../../src/theme/colors';
import { iosSystemColors } from '../../src/theme/ios-colors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SignInButton({ title, onPress }: { title: string; onPress: () => void }) {
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
  const { t } = useTranslation('auth');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Boardsesh</Text>
        <Text style={styles.subtitle}>{t('nativeStart.tagline')}</Text>
      </View>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && <SignInButton title={t('nativeStart.signInApple')} onPress={() => signIn('apple')} />}
        <SignInButton title={t('nativeStart.signInGoogle')} onPress={() => signIn('google')} />
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
    color: iosSystemColors.white,
    fontSize: 17,
    fontWeight: '600',
  },
});
