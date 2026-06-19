import { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { Text } from './Text';
import { SectionHeader } from './SectionHeader';
import { ListRow } from './ListRow';
import { Icon } from './Icon';
import { InfoRow } from './InfoRow';
import { useTheme } from '../providers/theme-provider';
import { useConfirm } from '../providers/dialog-provider';
import { hapticLight, hapticError } from '../lib/haptics';
import { getPreference, setPreference, removePreference } from '../lib/preference-store';

// The currently-applied runtime channel override, persisted for display. The
// actual override is stored natively by expo-updates and survives cold starts;
// this mirror just lets the UI show which channel a tester picked.
const OTA_CHANNEL_OVERRIDE_KEY = 'dev_ota_channel_override';

// The channels our OTA server publishes to (see docs/mobile-ota-updates.md). A
// tester can also type any other channel name in the custom field.
const PRESET_CHANNELS = ['production', 'preview-1', 'preview-2', 'preview-3', 'preview-4'] as const;

// The self-hosted (or EAS) updates URL baked into this build. We keep the same
// URL and only swap the `expo-channel-name` header, so the embedded code-signing
// cert keeps verifying the manifest.
function resolveUpdateUrl(): string | null {
  const url = Constants.expoConfig?.updates?.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

function applyOverride(channel: string | null): void {
  const updateUrl = resolveUpdateUrl();
  if (channel === null || updateUrl === null) {
    // null clears the override and reverts to the build-time channel + URL.
    Updates.setUpdateURLAndRequestHeadersOverride(null);
    return;
  }
  Updates.setUpdateURLAndRequestHeadersOverride({
    updateUrl,
    requestHeaders: { 'expo-channel-name': channel },
  });
}

export function ChannelSwitcherScreen() {
  const { systemColors, spacing, borderRadius } = useTheme();
  const confirm = useConfirm();
  const [override, setOverride] = useState<string | null>(null);
  const [customChannel, setCustomChannel] = useState('');
  const [switchingChannel, setSwitchingChannel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPreference<string>(OTA_CHANNEL_OVERRIDE_KEY).then((stored) => {
      if (active) setOverride(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const buildChannel = Updates.channel ?? 'unknown';
  const runtimeVersion = Updates.runtimeVersion ?? 'unknown';
  const updateUrl = resolveUpdateUrl();
  const updatesUsable = Updates.isEnabled && !__DEV__;
  const isSwitching = switchingChannel !== null;

  // A channel is "active" when it's the live override, or — with no override —
  // when it matches the build-time channel.
  const activeChannel = override ?? buildChannel;

  const switchToChannel = useCallback(
    async (channel: string) => {
      hapticLight();
      const confirmed = await confirm({
        title: 'Switch OTA channel',
        message: `Pull the latest update from "${channel}" and restart? It must have an update published for this build's fingerprint.`,
        confirmLabel: 'Switch',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      if (!updateUrl) {
        Alert.alert('Channel switch unavailable', 'This build has no OTA update URL configured.');
        return;
      }

      setSwitchingChannel(channel);
      try {
        applyOverride(channel);

        const checkResult = await Updates.checkForUpdateAsync();
        if (!checkResult.isAvailable) {
          throw new Error(
            `No update on "${channel}" for runtime ${runtimeVersion}. Publish an OTA to that channel at this build's fingerprint first.`,
          );
        }

        // Commit the channel only once the update is downloaded and we're about to
        // reload onto it — a failed fetch must never persist the new channel.
        await Updates.fetchUpdateAsync();
        await setPreference(OTA_CHANNEL_OVERRIDE_KEY, channel);
        setOverride(channel);
        await Updates.reloadAsync();
      } catch (switchError: unknown) {
        // Any failure after applyOverride(channel) reverts both the native override
        // and our persisted mirror to the previously-active channel, so the app is
        // never stranded on a channel with no usable update.
        applyOverride(override);
        if (override) {
          await setPreference(OTA_CHANNEL_OVERRIDE_KEY, override).catch(() => undefined);
        } else {
          await removePreference(OTA_CHANNEL_OVERRIDE_KEY).catch(() => undefined);
        }
        setSwitchingChannel(null);
        hapticError();
        Alert.alert(
          'Switch failed',
          switchError instanceof Error
            ? switchError.message
            : 'Could not switch channel. This build may not support runtime overrides.',
        );
      }
    },
    [confirm, updateUrl, override, runtimeVersion],
  );

  const resetToBuildChannel = useCallback(async () => {
    hapticLight();
    const confirmed = await confirm({
      title: 'Reset to build channel',
      message: `Clear the override and return to "${buildChannel}"? The app will restart.`,
      confirmLabel: 'Reset',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setSwitchingChannel(buildChannel);
    try {
      applyOverride(null);
      await removePreference(OTA_CHANNEL_OVERRIDE_KEY);
      const checkResult = await Updates.checkForUpdateAsync();
      if (checkResult.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
      await Updates.reloadAsync();
    } catch (resetError: unknown) {
      setSwitchingChannel(null);
      hapticError();
      Alert.alert('Reset failed', resetError instanceof Error ? resetError.message : 'Could not reset channel.');
    }
  }, [confirm, buildChannel]);

  const channels = Array.from(new Set<string>([...PRESET_CHANNELS, ...(override ? [override] : [])]));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <SectionHeader title="Current Update" />
      <View
        style={[
          styles.card,
          {
            backgroundColor: systemColors.secondaryBackground,
            borderRadius: borderRadius.lg,
            marginHorizontal: spacing[4],
          },
        ]}
      >
        <InfoRow label="Build channel" value={buildChannel} />
        <InfoRow label="Active channel" value={override ?? `${buildChannel} (default)`} />
        <InfoRow label="Runtime version" value={runtimeVersion} showSeparator={false} />
      </View>

      {!updatesUsable ? (
        <View style={[styles.notice, { marginHorizontal: spacing[4] }]}>
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            OTA updates are disabled in this build (development or updates not enabled), so channel switching is
            unavailable here. Use a TestFlight/store build.
          </Text>
        </View>
      ) : (
        <>
          <SectionHeader title="Switch Channel" />
          <View
            style={[
              styles.card,
              {
                backgroundColor: systemColors.secondaryBackground,
                borderRadius: borderRadius.lg,
                marginHorizontal: spacing[4],
              },
            ]}
          >
            {channels.map((channel, index) => {
              const isActive = channel === activeChannel;
              const isThisSwitching = switchingChannel === channel;
              const isDisabled = isSwitching && !isThisSwitching;
              const trailing = isThisSwitching ? (
                <ActivityIndicator size="small" />
              ) : isActive ? (
                <Icon name="check.small" size={20} color={systemColors.label} />
              ) : null;

              return (
                <ListRow
                  key={channel}
                  title={channel}
                  trailing={trailing}
                  onPress={isActive || isDisabled ? undefined : () => void switchToChannel(channel)}
                  showSeparator={index < channels.length - 1}
                  style={isDisabled ? styles.disabledRow : undefined}
                />
              );
            })}
          </View>

          <SectionHeader title="Custom Channel" />
          <View style={[styles.customRow, { marginHorizontal: spacing[4] }]}>
            <TextInput
              value={customChannel}
              onChangeText={setCustomChannel}
              placeholder="channel name"
              placeholderTextColor={systemColors.secondaryLabel}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSwitching}
              style={[
                styles.input,
                {
                  color: systemColors.label,
                  backgroundColor: systemColors.secondaryBackground,
                  borderRadius: borderRadius.md,
                },
              ]}
            />
            <Pressable
              onPress={() => {
                const trimmed = customChannel.trim();
                if (trimmed) void switchToChannel(trimmed);
              }}
              disabled={isSwitching || customChannel.trim().length === 0}
              style={[
                styles.goButton,
                {
                  backgroundColor: systemColors.tertiaryBackground,
                  borderRadius: borderRadius.md,
                  opacity: isSwitching || customChannel.trim().length === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Icon name="transfer" size={16} color={systemColors.label} />
              <Text variant="footnote" color={systemColors.label}>
                Switch
              </Text>
            </Pressable>
          </View>

          {override ? (
            <Pressable
              onPress={() => void resetToBuildChannel()}
              disabled={isSwitching}
              style={[styles.resetButton, { marginHorizontal: spacing[4], opacity: isSwitching ? 0.5 : 1 }]}
            >
              <Icon name="refresh" size={16} color={systemColors.label} />
              <Text variant="footnote" color={systemColors.label}>
                Reset to build channel ({buildChannel})
              </Text>
            </Pressable>
          ) : null}
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    overflow: 'hidden',
  },
  notice: {
    paddingVertical: 16,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 16,
  },
  disabledRow: {
    opacity: 0.5,
  },
  bottomSpacer: {
    height: 40,
  },
});
