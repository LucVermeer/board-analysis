import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

import { createIndexedDBStore } from './idb-helper';

const DB_NAME = 'boardsesh-react-query';
const STORE_NAME = 'cache';
const CLIENT_KEY = 'client';

const getDB = createIndexedDBStore(DB_NAME, STORE_NAME);

export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const db = await getDB();
      if (!db) return;
      try {
        await db.put(STORE_NAME, client, CLIENT_KEY);
      } catch (error) {
        console.error('Failed to persist react-query cache to IndexedDB:', error);
      }
    },
    restoreClient: async () => {
      const db = await getDB();
      if (!db) return undefined;
      try {
        const restored = (await db.get(STORE_NAME, CLIENT_KEY)) as PersistedClient | undefined;
        return restored;
      } catch (error) {
        console.error('Failed to restore react-query cache from IndexedDB:', error);
        return undefined;
      }
    },
    removeClient: async () => {
      const db = await getDB();
      if (!db) return;
      try {
        await db.delete(STORE_NAME, CLIENT_KEY);
      } catch (error) {
        console.error('Failed to remove react-query cache from IndexedDB:', error);
      }
    },
  };
}
