import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { HOLD_STATE_MAP, STATE_TO_PRIMARY_CODE } from '@boardsesh/board-constants/hold-states';
import type { BoardName, HoldState } from '@boardsesh/shared-schema';
import { getPreference, removePreference, setPreference } from './preference-store';

export type HoldColorOverrideRole = Extract<HoldState, 'STARTING' | 'HAND' | 'FINISH' | 'FOOT'>;
export type HoldColorOverrides = Partial<Record<HoldColorOverrideRole, string>>;

export type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

export const HOLD_COLOR_OVERRIDE_ROLES = ['STARTING', 'HAND', 'FINISH', 'FOOT'] as const;
export const DEFAULT_HOLD_COLOR_SIGNATURE = 'default';

const STORAGE_KEY = 'holdColorOverrides';
const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;
const HOLD_COLOR_OVERRIDE_ROLE_SET = new Set<string>(HOLD_COLOR_OVERRIDE_ROLES);
const FALLBACK_ROLE_COLOR = '#8e8e93';

type HoldColorSnapshot = {
  overrides: HoldColorOverrides;
  loaded: boolean;
  signature: string;
};

let currentOverrides: HoldColorOverrides = {};
let hasLoaded = false;
let snapshot: HoldColorSnapshot = {
  overrides: currentOverrides,
  loaded: hasLoaded,
  signature: DEFAULT_HOLD_COLOR_SIGNATURE,
};
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: HoldColorSnapshot = {
  overrides: {},
  loaded: false,
  signature: DEFAULT_HOLD_COLOR_SIGNATURE,
};

function isHoldColorOverrideRole(value: unknown): value is HoldColorOverrideRole {
  return typeof value === 'string' && HOLD_COLOR_OVERRIDE_ROLE_SET.has(value);
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  const withoutHash = trimmed.replace('#', '').toLowerCase();
  return `#${withoutHash}`;
}

export function sanitizeHoldColorOverrides(rawOverrides: unknown): HoldColorOverrides {
  if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) return {};

  const nextOverrides: HoldColorOverrides = {};
  for (const [role, rawColor] of Object.entries(rawOverrides)) {
    if (!isHoldColorOverrideRole(role)) continue;
    const color = normalizeHexColor(rawColor);
    if (color) nextOverrides[role] = color;
  }
  return nextOverrides;
}

export function buildHoldColorOverrideSignature(overrides: HoldColorOverrides): string {
  const parts: string[] = [];
  for (const role of HOLD_COLOR_OVERRIDE_ROLES) {
    const color = normalizeHexColor(overrides[role]);
    if (color) parts.push(`${role.toLowerCase()}-${color.slice(1)}`);
  }
  return parts.length > 0 ? parts.join('.') : DEFAULT_HOLD_COLOR_SIGNATURE;
}

export function hasHoldColorOverrides(overrides: HoldColorOverrides): boolean {
  return buildHoldColorOverrideSignature(overrides) !== DEFAULT_HOLD_COLOR_SIGNATURE;
}

function notify(): void {
  snapshot = {
    overrides: currentOverrides,
    loaded: hasLoaded,
    signature: buildHoldColorOverrideSignature(currentOverrides),
  };
  for (const listener of listeners) listener();
}

export async function loadHoldColorOverrides(): Promise<HoldColorOverrides> {
  if (hasLoaded) return currentOverrides;
  const storedOverrides = await getPreference<unknown>(STORAGE_KEY);
  if (hasLoaded) return currentOverrides;
  currentOverrides = sanitizeHoldColorOverrides(storedOverrides);
  hasLoaded = true;
  notify();
  return currentOverrides;
}

export async function setHoldColorOverridesPreference(nextOverrides: HoldColorOverrides): Promise<void> {
  currentOverrides = sanitizeHoldColorOverrides(nextOverrides);
  hasLoaded = true;
  notify();

  if (hasHoldColorOverrides(currentOverrides)) {
    await setPreference(STORAGE_KEY, currentOverrides);
  } else {
    await removePreference(STORAGE_KEY);
  }
}

export async function setHoldColorOverridePreference(role: HoldColorOverrideRole, color: string | null): Promise<void> {
  const nextOverrides: HoldColorOverrides = { ...currentOverrides };
  const normalizedColor = normalizeHexColor(color);
  if (normalizedColor) {
    nextOverrides[role] = normalizedColor;
  } else {
    delete nextOverrides[role];
  }
  await setHoldColorOverridesPreference(nextOverrides);
}

let loadPromise: Promise<HoldColorOverrides> | null = null;
function ensureHoldColorOverridesLoaded(): Promise<HoldColorOverrides> {
  if (!loadPromise) {
    loadPromise = loadHoldColorOverrides().catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): HoldColorSnapshot {
  return snapshot;
}

function getServerSnapshot(): HoldColorSnapshot {
  return SERVER_SNAPSHOT;
}

export function useHoldColorOverrides(): {
  overrides: HoldColorOverrides;
  loaded: boolean;
  signature: string;
  setRoleOverride: (role: HoldColorOverrideRole, color: string | null) => void;
  setOverrides: (nextOverrides: HoldColorOverrides) => void;
  resetOverrides: () => void;
} {
  const { overrides, loaded, signature } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    ensureHoldColorOverridesLoaded().catch(() => {});
  }, []);

  const setRoleOverride = useCallback((role: HoldColorOverrideRole, color: string | null) => {
    void setHoldColorOverridePreference(role, color);
  }, []);

  const setOverrides = useCallback((nextOverrides: HoldColorOverrides) => {
    void setHoldColorOverridesPreference(nextOverrides);
  }, []);

  const resetOverrides = useCallback(() => {
    void setHoldColorOverridesPreference({});
  }, []);

  return { overrides, loaded, signature, setRoleOverride, setOverrides, resetOverrides };
}

export function getDefaultHoldRoleColor(
  boardName: BoardName,
  role: HoldColorOverrideRole,
  variant: 'display' | 'led' = 'display',
): string {
  const roleCode = STATE_TO_PRIMARY_CODE[boardName]?.[role];
  if (roleCode === undefined) return FALLBACK_ROLE_COLOR;
  const roleInfo = HOLD_STATE_MAP[boardName]?.[roleCode];
  if (!roleInfo) return FALLBACK_ROLE_COLOR;
  return variant === 'display' ? (roleInfo.displayColor ?? roleInfo.color) : roleInfo.color;
}

export function getEffectiveHoldRoleColor(
  boardName: BoardName,
  role: HoldColorOverrideRole,
  overrides: HoldColorOverrides,
  variant: 'display' | 'led' = 'display',
): string {
  return overrides[role] ?? getDefaultHoldRoleColor(boardName, role, variant);
}

export function getEffectiveHoldStateColor(
  state: HoldState,
  fallbackColor: string,
  overrides: HoldColorOverrides,
): string {
  return isHoldColorOverrideRole(state) ? (overrides[state] ?? fallbackColor) : fallbackColor;
}

export function getBluetoothColorOverrides(overrides: HoldColorOverrides): HoldColorOverrides | undefined {
  const sanitizedOverrides = sanitizeHoldColorOverrides(overrides);
  return hasHoldColorOverrides(sanitizedOverrides) ? sanitizedOverrides : undefined;
}

export function hexToRgb(hexColor: string): RgbColor | null {
  const normalizedColor = normalizeHexColor(hexColor);
  if (!normalizedColor) return null;
  const hex = normalizedColor.slice(1);
  return {
    red: parseInt(hex.slice(0, 2), 16),
    green: parseInt(hex.slice(2, 4), 16),
    blue: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ red, green, blue }: RgbColor): string | null {
  if (!isRgbChannel(red) || !isRgbChannel(green) || !isRgbChannel(blue)) return null;
  const hex = [red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

export function parseRgbChannel(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) return null;
  const channel = Number(value);
  return isRgbChannel(channel) ? channel : null;
}

function isRgbChannel(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}
