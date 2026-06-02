'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';
import { useSearchData, useQueueActions } from '../graphql-queue';

type AutoConnectHandlerProps = {
  connect: (initialFrames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;
  isBluetoothSupported: boolean;
};

/**
 * Renderless component that handles the ?autoConnect={serialNumber} URL param.
 * When present, it auto-selects the first available climb and initiates
 * BLE connection to the board matching the given serial number.
 * The param is consumed (removed from URL) after use so refresh won't re-trigger.
 *
 * Accepts connect/isBluetoothSupported as props to avoid a circular import
 * with bluetooth-context (which renders this component).
 */
export function AutoConnectHandler({ connect, isBluetoothSupported }: AutoConnectHandlerProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useLocaleRouter();
  const { climbSearchResults, hasDoneFirstFetch } = useSearchData();
  const { setCurrentClimb } = useQueueActions();
  // The serial we've already acted on for the *current* occurrence of the
  // ?autoConnect param. NOT a fire-once boolean: this handler is mounted once
  // at the app root (inside the persistent BluetoothProvider) and never
  // remounts across navigation, so a boolean latch would swallow every
  // auto-connect after the first — breaking the board-config mismatch "Switch"
  // hand-off and repeated board-discovery taps, both of which client-navigate
  // with a fresh ?autoConnect each time. We strip the param after firing, so
  // resetting to null when it's absent lets the next occurrence (even the same
  // serial) auto-connect again, while still ignoring re-renders within one
  // occurrence.
  const triggeredForSerialRef = useRef<string | null>(null);

  const autoConnectSerial = searchParams.get('autoConnect');

  useEffect(() => {
    if (!autoConnectSerial) {
      // Param absent (initial load, or stripped after a prior auto-connect) —
      // clear the latch so a later navigation re-adding it fires.
      triggeredForSerialRef.current = null;
      return;
    }
    // Match the route's Zod schema: 1–64 chars, alphanumerics plus hyphens.
    // The mismatch-dialog "Switch" flow appends serials directly, including
    // hyphenated ones (KB-99, SN-1, etc.), so the validator must accept them.
    if (
      !/^[A-Za-z0-9-]+$/.test(autoConnectSerial) ||
      autoConnectSerial.length > 64 ||
      triggeredForSerialRef.current === autoConnectSerial
    )
      return;
    if (!hasDoneFirstFetch || !climbSearchResults || climbSearchResults.length === 0) return;
    if (!isBluetoothSupported) return;

    triggeredForSerialRef.current = autoConnectSerial;

    // Remove the param from URL immediately to prevent re-trigger
    const params = new URLSearchParams(searchParams.toString());
    params.delete('autoConnect');
    const newUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
    router.replace(newUrl);

    // Auto-select first climb and connect
    const firstClimb = climbSearchResults[0];
    void setCurrentClimb(firstClimb, { playlistSuggestionSource: null });
    void connect(firstClimb.frames, !!firstClimb.mirrored, autoConnectSerial);
  }, [
    autoConnectSerial,
    hasDoneFirstFetch,
    climbSearchResults,
    isBluetoothSupported,
    setCurrentClimb,
    connect,
    searchParams,
    pathname,
    router,
  ]);

  return null;
}
