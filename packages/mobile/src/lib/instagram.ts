import { Linking } from 'react-native';

const INSTAGRAM_APP_URL = 'instagram://camera';
const INSTAGRAM_WEB_URL = 'https://www.instagram.com';

/**
 * Open Instagram so the climber can post their reel. Instagram has no public
 * compose API, so we can't pre-fill the video or caption — the caller copies the
 * caption to the clipboard first and this just drops the user into Instagram's
 * camera. Tries the native app (`instagram://camera`); if that's rejected (app
 * not installed) it falls back to the website.
 *
 * Uses `openURL` + catch rather than `canOpenURL` on purpose: `canOpenURL` would
 * require declaring `instagram` in `LSApplicationQueriesSchemes`, which needs a
 * native rebuild. `openURL` works without it and degrades gracefully. Returns
 * true if anything opened.
 */
export async function openInstagram(): Promise<boolean> {
  try {
    await Linking.openURL(INSTAGRAM_APP_URL);
    return true;
  } catch {
    try {
      await Linking.openURL(INSTAGRAM_WEB_URL);
      return true;
    } catch {
      return false;
    }
  }
}
