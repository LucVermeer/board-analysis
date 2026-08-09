import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { PrivateAttemptVideo } from '@boardsesh/shared-schema';

const INDEX_KEY = 'localAttemptVideosV1';
const DIRECTORY_NAME = 'attempt-videos';

type LocalAttemptRecord = Omit<PrivateAttemptVideo, 'playbackPath'> & { fileName: string };

function directory(): Directory {
  const result = new Directory(Paths.document, DIRECTORY_NAME);
  result.create({ idempotent: true, intermediates: true });
  return result;
}

async function readIndex(): Promise<LocalAttemptRecord[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as LocalAttemptRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(records: LocalAttemptRecord[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(records));
}

function publicVideo(record: LocalAttemptRecord): PrivateAttemptVideo {
  return { ...record, playbackPath: new File(directory(), record.fileName).uri };
}

export function localAttemptVideosQueryKey(climbUuid: string, layoutId: number, angle: number) {
  return ['localAttemptVideos', climbUuid, layoutId, angle] as const;
}

export async function listLocalAttemptVideos(
  climbUuid: string,
  layoutId: number,
  angle: number,
): Promise<PrivateAttemptVideo[]> {
  const records = await readIndex();
  return records
    .filter((record) => record.climbUuid === climbUuid && record.layoutId === layoutId && record.angle === angle)
    .filter((record) => new File(directory(), record.fileName).exists)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .map(publicVideo);
}

export async function saveLocalAttemptVideo(input: {
  source: File;
  uuid: string;
  climbUuid: string;
  layoutId: number;
  angle: number;
  isMirror: boolean;
  mimeType: string;
  durationMs: number;
  recordedAt: string;
}): Promise<PrivateAttemptVideo> {
  const extension = input.mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const fileName = `${input.uuid}.${extension}`;
  const destination = new File(directory(), fileName);
  await input.source.copy(destination);
  const now = new Date().toISOString();
  const record: LocalAttemptRecord = {
    uuid: input.uuid,
    tickUuid: '',
    boardType: 'moonboard',
    climbProvider: 'boardsesh_public_graphql_search_climbs',
    climbUuid: input.climbUuid,
    layoutId: input.layoutId,
    angle: input.angle,
    isMirror: input.isMirror,
    mimeType: input.mimeType,
    byteSize: destination.size,
    durationMs: input.durationMs,
    recordedAt: input.recordedAt,
    createdAt: now,
    fileName,
  };
  try {
    const records = await readIndex();
    await writeIndex([record, ...records.filter((item) => item.uuid !== record.uuid)]);
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
  return publicVideo(record);
}

export async function deleteLocalAttemptVideo(uuid: string): Promise<void> {
  const records = await readIndex();
  const record = records.find((item) => item.uuid === uuid);
  if (record) {
    const file = new File(directory(), record.fileName);
    if (file.exists) file.delete();
  }
  await writeIndex(records.filter((item) => item.uuid !== uuid));
}

export function isLocalAttemptVideo(video: PrivateAttemptVideo): boolean {
  return video.playbackPath.startsWith('file:');
}
