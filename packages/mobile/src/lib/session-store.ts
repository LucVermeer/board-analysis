import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_WRITE_OPTIONS } from './secure-store-options';

const SESSION_ID_KEY = 'boardsesh_active_session_id';

export async function getStoredSessionId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

export async function setStoredSessionId(sessionId: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_ID_KEY, sessionId, SECURE_STORE_WRITE_OPTIONS);
}

export async function clearStoredSessionId(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_ID_KEY);
}
