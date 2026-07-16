import { createIndexedDBStore } from './idb-helper';

// Per-gym dismissal state for the manage-console welcome checklist. A manager
// dismisses the card once per gym and it stays gone on that device.

const STORE_NAME = 'gym-welcome';

const getDB = createIndexedDBStore('boardsesh-gym-welcome', STORE_NAME);

const getDismissKey = (gymUuid: string): string => `dismissed-${gymUuid}`;

/** Whether the manager already dismissed the welcome checklist for this gym. */
export const isGymWelcomeDismissed = async (gymUuid: string): Promise<boolean> => {
  try {
    const db = await getDB();
    if (!db) return false;
    return (await db.get(STORE_NAME, getDismissKey(gymUuid))) === true;
  } catch (error) {
    console.error('Failed to read gym welcome dismissal:', error);
    return false;
  }
};

/** Dismiss the welcome checklist for this gym so it doesn't show again. */
export const dismissGymWelcome = async (gymUuid: string): Promise<void> => {
  try {
    const db = await getDB();
    if (!db) return;
    await db.put(STORE_NAME, true, getDismissKey(gymUuid));
  } catch (error) {
    console.error('Failed to persist gym welcome dismissal:', error);
  }
};
