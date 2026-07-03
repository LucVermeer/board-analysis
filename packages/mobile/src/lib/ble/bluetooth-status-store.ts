import { useSyncExternalStore } from 'react';
import { setPersonProperties } from '../analytics';
import { reportHandledError } from '../error-reporting';

let connectedCount = 0;
const listeners = new Set<() => void>();
const activeDisconnects = new Set<() => void>();
// Avoids a PostHog request on every reconnect in a high-reconnect session; resets
// on app restart, which is harmless since setOnce is idempotent server-side anyway.
let hasMarkedConnectedBoard = false;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return connectedCount > 0;
}

export function registerBluetoothConnection(disconnect: () => void): () => void {
  connectedCount += 1;
  activeDisconnects.add(disconnect);
  notify();
  // Durably marks the person as having connected a physical board at least once.
  if (!hasMarkedConnectedBoard) {
    hasMarkedConnectedBoard = true;
    setPersonProperties(undefined, { has_connected_board: true });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    connectedCount = Math.max(0, connectedCount - 1);
    activeDisconnects.delete(disconnect);
    notify();
  };
}

export function disconnectAllBluetooth(): void {
  const snapshot = Array.from(activeDisconnects);
  for (const disconnect of snapshot) {
    try {
      disconnect();
    } catch (error) {
      console.error('Failed to disconnect bluetooth:', error);
      reportHandledError(error, { tags: { source: 'ble-disconnect' } });
    }
  }
}

export function useBluetoothConnectedStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
