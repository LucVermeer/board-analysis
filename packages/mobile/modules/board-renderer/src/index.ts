import { requireNativeModule } from 'expo-modules-core';

type BoardRendererNativeModule = {
  renderComposite(configJson: string, backgroundPaths: string[], cacheKey: string): Promise<string>;
};

const BoardRendererNative = requireNativeModule<BoardRendererNativeModule>('BoardRenderer');

export async function renderComposite(
  configJson: string,
  backgroundPaths: string[],
  cacheKey: string,
): Promise<string> {
  return BoardRendererNative.renderComposite(configJson, backgroundPaths, cacheKey);
}
