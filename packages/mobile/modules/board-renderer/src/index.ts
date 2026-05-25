import { requireOptionalNativeModule } from 'expo-modules-core';

type BoardRendererNativeModule = {
  renderComposite(configJson: string, backgroundPaths: string[], cacheKey: string): Promise<string>;
};

// requireOptionalNativeModule returns null (silently) when the module
// isn't linked into the running binary — e.g. in Expo Go, or a dev
// client built before the native module was added. Using the throwing
// `requireNativeModule` here would log a noisy `Cannot find native
// module 'BoardRenderer'` error in the JS console even though the
// hook's fallback path handles it gracefully.
export const boardRendererNative =
  requireOptionalNativeModule<BoardRendererNativeModule>('BoardRenderer');

export async function renderComposite(
  configJson: string,
  backgroundPaths: string[],
  cacheKey: string,
): Promise<string> {
  if (!boardRendererNative) {
    throw new Error('BoardRenderer native module is not available');
  }
  return boardRendererNative.renderComposite(configJson, backgroundPaths, cacheKey);
}
