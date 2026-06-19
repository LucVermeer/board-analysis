import { useState, useCallback, useEffect, useRef } from 'react';
import { View, ScrollView, ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import * as Updates from 'expo-updates';
import { reportError } from '../lib/error-reporting';
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

// Switch channels by overriding ONLY the `expo-channel-name` request header,
// keeping the build's update URL (so the embedded code-signing cert still
// verifies the manifest). Unlike setUpdateURLAndRequestHeadersOverride, the
// header-only override needs NO `disableAntiBrickingMeasures` — expo-updates
// permits overriding a header that was baked in at build time, and production
// builds bake `expo-channel-name`. It throws if that header wasn't embedded
// (e.g. EAS-hosted builds); callers catch and surface that. `null` clears the
// override and reverts to the build-time channel.
function applyChannelOverride(channel: string | null): void {
  Updates.setUpdateRequestHeadersOverride(channel === null ? null : { 'expo-channel-name': channel });
}

export function ChannelSwitcherScreen() {
  const { systemColors, spacing, borderRadius } = useTheme();
  const confirm = useConfirm();
  const [override, setOverride] = useState<string | null>(null);
  const [customChannel, setCustomChannel] = useState('');
  const [switchingChannel, setSwitchingChannel] = useState<string | null>(null);
  // Synchronous re-entrancy guard: `switchingChannel` only updates after the async
  // confirm dialog resolves, so a ref blocks a second switch starting while the
  // dialog (or an in-flight switch) is open.
  const inFlightRef = useRef(false);

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
  const updatesUsable = Updates.isEnabled && !__DEV__;
  const isSwitching = switchingChannel !== null;

  // A channel is "active" when it's the live override, or — with no override —
  // when it matches the build-time channel.
  const activeChannel = override ?? buildChannel;

  const switchToChannel = useCallback(
    async (channel: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      hapticLight();
      // `committed` flips once the update for `channel` is downloaded. Before it,
      // any failure fully reverts; after it, the update will launch on reload (or
      // the next cold start), so we keep the override instead of stranding a half-
      // applied switch.
      let committed = false;
      try {
        const confirmed = await confirm({
          title: 'Switch OTA channel',
          message: `Pull the latest update from "${channel}" and restart? It must have an update published for this build's fingerprint.`,
          confirmLabel: 'Switch',
          cancelLabel: 'Cancel',
        });
        if (!confirmed) return;

        setSwitchingChannel(channel);
        applyChannelOverride(channel);

        const checkResult = await Updates.checkForUpdateAsync();
        if (!checkResult.isAvailable) {
          throw new Error(
            `No update on "${channel}" for runtime ${runtimeVersion}. Publish an OTA to that channel at this build's fingerprint first.`,
          );
        }

        await Updates.fetchUpdateAsync();
        committed = true;
        await setPreference(OTA_CHANNEL_OVERRIDE_KEY, channel).catch(reportError);
        setOverride(channel);
        await Updates.reloadAsync();
      } catch (switchError: unknown) {
        if (committed) {
          // Update is downloaded; it applies on the next restart. Keep the override.
          setOverride(channel);
          Alert.alert('Restart to finish', `Downloaded "${channel}". Restart the app to switch onto it.`);
        } else {
          // Pre-commit failure: revert the native override AND the persisted mirror
          // to the previously-active channel so nothing is stranded.
          applyChannelOverride(override);
          await (
            override ? setPreference(OTA_CHANNEL_OVERRIDE_KEY, override) : removePreference(OTA_CHANNEL_OVERRIDE_KEY)
          ).catch(reportError);
          hapticError();
          Alert.alert(
            'Switch failed',
            switchError instanceof Error
              ? switchError.message
              : 'Could not switch channel. This build may not support channel overrides.',
          );
        }
      } finally {
        setSwitchingChannel(null);
        inFlightRef.current = false;
      }
    },
    [confirm, override, runtimeVersion],
  );

  const resetToBuildChannel = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    hapticLight();
    let committed = false;
    try {
      const confirmed = await confirm({
        title: 'Reset to build channel',
        message: `Clear the override and return to "${buildChannel}"? The app will restart.`,
        confirmLabel: 'Reset',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      setSwitchingChannel(buildChannel);
      applyChannelOverride(null);
      const checkResult = await Updates.checkForUpdateAsync();
      if (checkResult.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
      committed = true;
      await removePreference(OTA_CHANNEL_OVERRIDE_KEY).catch(reportError);
      setOverride(null);
      await Updates.reloadAsync();
    } catch (resetError: unknown) {
      if (committed) {
        setOverride(null);
        Alert.alert('Restart to finish', `Cleared the override. Restart the app to return to "${buildChannel}".`);
      } else {
        // Pre-commit failure: re-apply the previous override so we don't leave the
        // app pointed at the build channel before a successful reload.
        applyChannelOverride(override);
        hapticError();
        Alert.alert('Reset failed', resetError instanceof Error ? resetError.message : 'Could not reset channel.');
      }
    } finally {
      setSwitchingChannel(null);
      inFlightRef.current = false;
    }
  }, [confirm, buildChannel, override]);

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
