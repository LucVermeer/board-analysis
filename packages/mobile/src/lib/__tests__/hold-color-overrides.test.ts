import { beforeEach, describe, expect, it, vi } from 'vitest';

type AsyncStorageStub = {
  clear: () => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

async function getAsyncStorage(): Promise<AsyncStorageStub> {
  return (await import('@react-native-async-storage/async-storage')).default as unknown as AsyncStorageStub;
}

describe('hold-color-overrides', () => {
  beforeEach(async () => {
    vi.resetModules();
    await (await getAsyncStorage()).clear();
  });

  it('normalizes and sanitizes role colour overrides', async () => {
    const { sanitizeHoldColorOverrides } = await import('../hold-color-overrides');

    expect(
      sanitizeHoldColorOverrides({
        STARTING: 'ABCDEF',
        HAND: '#123456',
        FINISH: '#bad',
        ANY: '#ffffff',
        FOOT: 42,
      }),
    ).toEqual({ STARTING: '#abcdef', HAND: '#123456' });
  });

  it('builds a stable default-or-custom signature', async () => {
    const { DEFAULT_HOLD_COLOR_SIGNATURE, buildHoldColorOverrideSignature } = await import('../hold-color-overrides');

    expect(buildHoldColorOverrideSignature({})).toBe(DEFAULT_HOLD_COLOR_SIGNATURE);
    expect(buildHoldColorOverrideSignature({ HAND: '#123456', STARTING: '#abcdef' })).toBe(
      'starting-abcdef.hand-123456',
    );
  });

  it('persists configured overrides and removes the preference when reset', async () => {
    const asyncStorage = await getAsyncStorage();
    const { setHoldColorOverridesPreference } = await import('../hold-color-overrides');

    await setHoldColorOverridesPreference({ HAND: '#123456' });
    expect(await asyncStorage.getItem('holdColorOverrides')).toBe(JSON.stringify({ HAND: '#123456' }));

    await setHoldColorOverridesPreference({});
    expect(await asyncStorage.getItem('holdColorOverrides')).toBeNull();
  });

  it('loads sanitized stored overrides', async () => {
    const asyncStorage = await getAsyncStorage();
    await asyncStorage.setItem('holdColorOverrides', JSON.stringify({ FOOT: '#654321', ANY: '#ffffff' }));
    const { loadHoldColorOverrides } = await import('../hold-color-overrides');

    expect(await loadHoldColorOverrides()).toEqual({ FOOT: '#654321' });
  });

  it('exposes Bluetooth overrides only when at least one custom colour is configured', async () => {
    const { getBluetoothColorOverrides } = await import('../hold-color-overrides');

    expect(getBluetoothColorOverrides({})).toBeUndefined();
    expect(getBluetoothColorOverrides({ FINISH: '#abcdef' })).toEqual({ FINISH: '#abcdef' });
  });

  it('converts between hex colours and editable RGB channels', async () => {
    const { hexToRgb, parseRgbChannel, rgbToHex } = await import('../hold-color-overrides');

    expect(hexToRgb('#0a10ff')).toEqual({ red: 10, green: 16, blue: 255 });
    expect(rgbToHex({ red: 10, green: 16, blue: 255 })).toBe('#0a10ff');
    expect(parseRgbChannel('255')).toBe(255);
    expect(parseRgbChannel('256')).toBeNull();
    expect(parseRgbChannel('1.5')).toBeNull();
  });
});
