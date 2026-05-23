import * as SecureStore from 'expo-secure-store';

export type StoredBoardConfig = {
  boardUuid: string;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

const BOARD_CONFIG_KEY = 'boardsesh_active_board';

export async function getStoredBoardConfig(): Promise<StoredBoardConfig | null> {
  try {
    const value = await SecureStore.getItemAsync(BOARD_CONFIG_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function setStoredBoardConfig(config: StoredBoardConfig): Promise<void> {
  await SecureStore.setItemAsync(BOARD_CONFIG_KEY, JSON.stringify(config));
}

export async function clearStoredBoardConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(BOARD_CONFIG_KEY);
}
