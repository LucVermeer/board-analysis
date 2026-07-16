export type AppSettings = {
  defaultBoardUuid: string | null;
  syncEnabledBoards: string[];
  /** Keep every board the user follows/uses available offline by default. */
  autoOfflineBoards: boolean;
  autoConnectBle: boolean;
  keepScreenAwake: boolean;
  theme: 'system' | 'light' | 'dark';
  hapticFeedbackEnabled: boolean;
  notifySessionInvites: boolean;
  notifyClimbComments: boolean;
  /** One-shot: the "kiosk setup lives on the big screen" hint has been seen on My gyms. */
  kioskHintSeen: boolean;
};

export type SettingsKey = keyof AppSettings;
