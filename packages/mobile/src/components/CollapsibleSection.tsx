import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import { hapticSelection } from '../lib/haptics';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing, borderRadius } from '../theme/tokens';
import { timing } from '../theme/animations';

type CollapsibleSectionProps = {
  title: string;
  defaultExpanded?: boolean;
  /**
   * When true the section header has no chevron and cannot be collapsed by
   * the user. Mirrors the web `keepExpanded` flag used for hero sections
   * (e.g. Beta Videos) where users should always see the content.
   */
  keepExpanded?: boolean;
  /** Short text shown next to the title when the section is collapsed (e.g. active filter values). */
  summary?: string | null;
  /** When this value changes, expanded state resets to `defaultExpanded` without remounting the tree. */
  resetKey?: number;
  /** Optional trailing action rendered in the header (e.g. an Attach button). */
  headerAction?: ReactNode;
  /** Fires with the measured height of the header row whenever layout settles. */
  onHeaderLayout?: (height: number) => void;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  keepExpanded = false,
  summary,
  resetKey,
  headerAction,
  onHeaderLayout,
  children,
}: CollapsibleSectionProps) {
  const handleHeaderLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeaderLayout?.(event.nativeEvent.layout.height);
    },
    [onHeaderLayout],
  );

  if (keepExpanded) {
    return (
      <View style={styles.container}>
        <View style={styles.header} onLayout={onHeaderLayout ? handleHeaderLayout : undefined}>
          <Text variant="headline" style={styles.title}>
            {title}
          </Text>
          {headerAction}
        </View>
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <CollapsibleSectionInternal
      title={title}
      defaultExpanded={defaultExpanded}
      summary={summary}
      resetKey={resetKey}
      headerAction={headerAction}
      onHeaderLayout={onHeaderLayout ? handleHeaderLayout : undefined}
    >
      {children}
    </CollapsibleSectionInternal>
  );
}

function CollapsibleSectionInternal({
  title,
  defaultExpanded,
  summary,
  resetKey,
  headerAction,
  onHeaderLayout,
  children,
}: {
  title: string;
  defaultExpanded: boolean;
  summary?: string | null;
  resetKey?: number;
  headerAction?: ReactNode;
  onHeaderLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const chevronRotation = useSharedValue(defaultExpanded ? 1 : 0);

  const isFirstReset = useRef(true);
  useEffect(() => {
    if (isFirstReset.current) {
      isFirstReset.current = false;
      return;
    }
    setExpanded(defaultExpanded);
    chevronRotation.value = withTiming(defaultExpanded ? 1 : 0, { duration: timing.normal });
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpanded = useCallback(() => {
    hapticSelection();
    setExpanded((prev) => {
      const next = !prev;
      chevronRotation.value = withTiming(next ? 1 : 0, { duration: timing.normal });
      return next;
    });
  }, [chevronRotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }));

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        style={styles.header}
        onLayout={onHeaderLayout}
      >
        <Text variant="headline" style={styles.title}>
          {title}
        </Text>
        {!expanded && summary ? (
          <Text variant="footnote" style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
        {headerAction}
        <Animated.View style={chevronStyle}>
          <Icon name="chevron.down" size={16} color={iosSystemColors.systemGray} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.content}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    backgroundColor: `${iosSystemColors.systemGray}14`,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  title: {
    flex: 1,
  },
  summary: {
    opacity: 0.55,
    flexShrink: 1,
    marginRight: spacing[2],
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
});
