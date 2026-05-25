import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Shape of the native module. Both fields are optional because we need
 * to bridge two binary generations:
 *
 *  - New binaries (post-overlay-only rewrite) export `renderHoldsOverlay`,
 *    which writes a transparent PNG containing only the hold markers.
 *  - Old binaries export `renderComposite`, which composites the holds on
 *    top of background images and writes a single combined PNG. Calling
 *    it with an empty `backgroundPaths` array produces the same
 *    transparent holds-only output we want from the new API.
 *
 * This shim lets a JS-only EAS OTA update reach testers without forcing
 * everyone to install a fresh native build first.
 */
type BoardRendererNativeModule = {
  renderHoldsOverlay?(configJson: string, cacheKey: string): Promise<string>;
  renderComposite?(
    configJson: string,
    backgroundPaths: string[],
    cacheKey: string,
  ): Promise<string>;
};

// requireOptionalNativeModule returns null (silently) when the module
// isn't linked into the running binary — e.g. in Expo Go, or a dev
// client built before the native module was added. Using the throwing
// `requireNativeModule` here would log a noisy `Cannot find native
// module 'BoardRenderer'` error in the JS console even though the
// hook's fallback path handles it gracefully.
export const boardRendererNative =
  requireOptionalNativeModule<BoardRendererNativeModule>('BoardRenderer');

export async function renderHoldsOverlay(
  configJson: string,
  cacheKey: string,
): Promise<string> {
  if (!boardRendererNative) {
    throw new Error('BoardRenderer native module is not available');
  }
  if (typeof boardRendererNative.renderHoldsOverlay === 'function') {
    return boardRendererNative.renderHoldsOverlay(configJson, cacheKey);
  }
  if (typeof boardRendererNative.renderComposite === 'function') {
    // Old binary path. Empty backgroundPaths means the host-side
    // compositor draws nothing under the overlay, so the resulting PNG
    // is the same transparent holds-only image the new API produces.
    return boardRendererNative.renderComposite(configJson, [], cacheKey);
  }
  throw new Error('BoardRenderer native module exposes no usable render function');
}
