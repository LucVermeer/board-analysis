import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preferences, files } = vi.hoisted(() => ({
  preferences: new Map<string, string>(),
  files: new Map<string, number>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => preferences.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => preferences.set(key, value)),
  },
}));

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(root: { uri: string }, name: string) {
      this.uri = `${root.uri}/${name}`;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(root: Directory | string, name?: string) {
      this.uri = typeof root === 'string' ? root : `${root.uri}/${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri) ?? 0;
    }
    async copy(destination: File) {
      files.set(destination.uri, this.size);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///documents' } } };
});

import { File } from 'expo-file-system';
import { deleteLocalAttemptVideo, listLocalAttemptVideos, saveLocalAttemptVideo } from '../local-attempt-videos';

beforeEach(() => {
  preferences.clear();
  files.clear();
});

describe('local attempt videos', () => {
  it('copies, lists, and deletes a recording in persistent device storage', async () => {
    const source = new File('file:///cache/recording.mp4');
    files.set(source.uri, 1234);

    const saved = await saveLocalAttemptVideo({
      source,
      uuid: 'attempt-1',
      climbUuid: 'climb-1',
      layoutId: 3,
      angle: 40,
      isMirror: false,
      mimeType: 'video/mp4',
      durationMs: 2500,
      recordedAt: '2026-08-09T12:00:00.000Z',
    });

    expect(saved.playbackPath).toBe('file:///documents/attempt-videos/attempt-1.mp4');
    await expect(listLocalAttemptVideos('climb-1', 3, 40)).resolves.toEqual([saved]);
    await deleteLocalAttemptVideo(saved.uuid);
    await expect(listLocalAttemptVideos('climb-1', 3, 40)).resolves.toEqual([]);
  });
});
