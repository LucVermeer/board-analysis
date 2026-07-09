export type MoonBoardImportCounts = {
  imported: number;
  skipped: number;
  failed: number;
};

export type MoonBoardImportResult = {
  ticks?: MoonBoardImportCounts;
  ascents: MoonBoardImportCounts;
  attempts: MoonBoardImportCounts;
  unresolvedClimbs: string[];
  unresolvedAscentClimbs?: string[];
  unresolvedAttemptClimbs?: string[];
  partialError?: string;
};

export type MoonBoardImportProgress = {
  step: string;
  message?: string;
  current?: number;
  total?: number;
};

export type MoonBoardImportProgressEvent =
  | ({ type: 'progress' } & MoonBoardImportProgress)
  | { type: 'complete'; results: MoonBoardImportResult }
  | { type: 'error'; error: string };

export type MoonBoardExportPreview = {
  username?: string;
  rows: number;
  sends: number;
  flashes: number;
  attempts: number;
  projects: number;
  fails: number;
  angle: number;
};

export type StrippedMoonBoardExportData = unknown;

export type ParsedMoonBoardExport = {
  data: StrippedMoonBoardExportData;
  preview: MoonBoardExportPreview;
};

type MoonBoardSharedSchemaModule = {
  parseMoonBoardExportCsv?: (csv: string) => unknown | Promise<unknown>;
};

type StreamMoonBoardImportOptions = {
  backendUrl?: string | null;
  authToken?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function normalizeMoonBoardParsedExport(parsed: unknown): ParsedMoonBoardExport {
  if (!isRecord(parsed) || !('data' in parsed) || !isRecord(parsed.preview)) {
    throw new Error('moonboard_parser_invalid_result');
  }

  const preview = parsed.preview;
  return {
    data: parsed.data,
    preview: {
      username: readString(preview, ['username', 'userName']),
      rows: readNumber(preview, ['rows', 'rowCount', 'entries', 'totalRows']) ?? 0,
      sends: readNumber(preview, ['sends', 'ascents', 'sendCount']) ?? 0,
      flashes: readNumber(preview, ['flashes', 'flashCount']) ?? 0,
      attempts: readNumber(preview, ['attempts', 'attemptCount']) ?? 0,
      projects: readNumber(preview, ['projects', 'projectCount']) ?? 0,
      fails: readNumber(preview, ['fails', 'failures', 'failCount']) ?? 0,
      angle: readNumber(preview, ['angle', 'boardAngle']) ?? 40,
    },
  };
}

export async function parseMoonBoardExportCsvForImport(csv: string): Promise<ParsedMoonBoardExport> {
  const sharedSchema = (await import('@boardsesh/shared-schema')) as unknown as MoonBoardSharedSchemaModule;
  if (typeof sharedSchema.parseMoonBoardExportCsv !== 'function') {
    throw new Error('moonboard_parser_unavailable');
  }
  return normalizeMoonBoardParsedExport(await sharedSchema.parseMoonBoardExportCsv(csv));
}

function parseMoonBoardImportEvent(line: string): MoonBoardImportProgressEvent | null {
  try {
    return JSON.parse(line) as MoonBoardImportProgressEvent;
  } catch {
    return null;
  }
}

function normalizeMoonBoardImportErrorCode(message: string): string {
  switch (message) {
    case 'moonboard_import_endpoint_unavailable':
    case 'moonboard_import_failed':
    case 'moonboard_import_interrupted':
      return message;
    case 'Authentication required':
    case 'Invalid or expired token':
    case 'Invalid JSON body':
    case 'Invalid request body':
    case 'Request body too large':
      return 'moonboard_import_failed';
    default:
      return 'moonboard_import_failed';
  }
}

async function handleMoonBoardImportEvent(
  event: MoonBoardImportProgressEvent,
  onEvent: (event: MoonBoardImportProgressEvent) => void,
): Promise<
  { type: 'complete'; result: MoonBoardImportResult } | { type: 'error'; error: string } | { type: 'progress' }
> {
  if (event.type === 'complete') {
    return { type: 'complete', result: event.results };
  }
  if (event.type === 'error') {
    return { type: 'error', error: event.error };
  }
  onEvent(event);
  return { type: 'progress' };
}

async function readStreamingMoonBoardImportResponse(
  response: Response,
  onEvent: (event: MoonBoardImportProgressEvent) => void,
): Promise<MoonBoardImportResult> {
  if (!response.body) {
    return readTextMoonBoardImportResponse(response, onEvent);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: MoonBoardImportResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseMoonBoardImportEvent(line);
      if (!event) continue;
      const eventResult = await handleMoonBoardImportEvent(event, onEvent);
      if (eventResult.type === 'complete') result = eventResult.result;
      if (eventResult.type === 'error') throw new Error(normalizeMoonBoardImportErrorCode(eventResult.error));
    }
  }

  if (buffer.trim()) {
    const event = parseMoonBoardImportEvent(buffer);
    if (event) {
      const eventResult = await handleMoonBoardImportEvent(event, onEvent);
      if (eventResult.type === 'complete') result = eventResult.result;
      if (eventResult.type === 'error') throw new Error(normalizeMoonBoardImportErrorCode(eventResult.error));
    }
  }

  if (!result) throw new Error('moonboard_import_interrupted');
  return result;
}

async function readTextMoonBoardImportResponse(
  response: Response,
  onEvent: (event: MoonBoardImportProgressEvent) => void,
): Promise<MoonBoardImportResult> {
  const text = await response.text();
  let result: MoonBoardImportResult | null = null;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const event = parseMoonBoardImportEvent(line);
    if (!event) continue;
    const eventResult = await handleMoonBoardImportEvent(event, onEvent);
    if (eventResult.type === 'complete') result = eventResult.result;
    if (eventResult.type === 'error') throw new Error(normalizeMoonBoardImportErrorCode(eventResult.error));
  }

  if (!result) throw new Error('moonboard_import_interrupted');
  return result;
}

async function readMoonBoardErrorCode(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as { error?: unknown };
    return normalizeMoonBoardImportErrorCode(
      typeof errorBody.error === 'string' ? errorBody.error : 'moonboard_import_failed',
    );
  } catch {
    return 'moonboard_import_failed';
  }
}

export async function streamMoonBoardImport(
  data: StrippedMoonBoardExportData,
  onEvent: (event: MoonBoardImportProgressEvent) => void,
  options: StreamMoonBoardImportOptions = {},
): Promise<void> {
  if (!options.backendUrl) {
    throw new Error('moonboard_import_endpoint_unavailable');
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.authToken) {
    headers.set('Authorization', `Bearer ${options.authToken}`);
  }

  const response = await fetch(`${options.backendUrl.replace(/\/+$/, '')}/api/moonboard-import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    throw new Error(await readMoonBoardErrorCode(response));
  }

  const result = await readStreamingMoonBoardImportResponse(response, onEvent);
  onEvent({ type: 'complete', results: result });
}
