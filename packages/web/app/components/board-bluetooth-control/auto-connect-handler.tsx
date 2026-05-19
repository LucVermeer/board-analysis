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
  const triggeredRef = useRef(false);

  const autoConnectSerial = searchParams.get('autoConnect');

  useEffect(() => {
    // Match the route's Zod schema: 1–64 chars, alphanumerics plus hyphens.
    // The mismatch-dialog "Switch" flow appends serials directly, including
    // hyphenated ones (KB-99, SN-1, etc.), so the validator must accept them.
    if (
      !autoConnectSerial ||
      !/^[A-Za-z0-9-]+$/.test(autoConnectSerial) ||
      autoConnectSerial.length > 64 ||
      triggeredRef.current
    )
      return;
    if (!hasDoneFirstFetch || !climbSearchResults || climbSearchResults.length === 0) return;
    if (!isBluetoothSupported) return;

    triggeredRef.current = true;

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
