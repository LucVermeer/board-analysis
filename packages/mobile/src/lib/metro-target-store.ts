import * as SecureStore from 'expo-secure-store';
import { normalizeMetroTarget } from './metro-discovery';

const METRO_TARGETS_KEY = 'boardsesh_dev_metro_hosts';
const MAX_TARGETS = 20;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export async function getSavedMetroTargets(): Promise<string[]> {
  try {
    const value = await SecureStore.getItemAsync(METRO_TARGETS_KEY);
    if (!value) return [];

    const parsed: unknown = JSON.parse(value);
    if (!isStringArray(parsed)) return [];

    return Array.from(new Set(parsed.map(normalizeMetroTarget).filter((target): target is string => target !== null)));
  } catch {
    return [];
  }
}

export async function addSavedMetroTarget(value: string): Promise<string> {
  const normalizedTarget = normalizeMetroTarget(value);
  if (!normalizedTarget) {
    throw new Error('Enter a host or an http://host:port URL');
  }

  const existingTargets = await getSavedMetroTargets();
  const updatedTargets = [normalizedTarget, ...existingTargets.filter((target) => target !== normalizedTarget)].slice(
    0,
    MAX_TARGETS,
  );

  await SecureStore.setItemAsync(METRO_TARGETS_KEY, JSON.stringify(updatedTargets));
  return normalizedTarget;
}

export async function removeSavedMetroTarget(value: string): Promise<void> {
  const existingTargets = await getSavedMetroTargets();
  const updatedTargets = existingTargets.filter((target) => target !== value);
  await SecureStore.setItemAsync(METRO_TARGETS_KEY, JSON.stringify(updatedTargets));
}
