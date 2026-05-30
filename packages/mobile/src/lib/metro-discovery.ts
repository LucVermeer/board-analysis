import { createTimeoutSignal } from './abort-timeout';

export const DEFAULT_METRO_PORTS = [
  8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099,
] as const;

export type MetroDiscoverySource = 'embedded' | 'saved';

export type MetroInfo = {
  version: number;
  branchName: string | null;
  commitSha: string | null;
  rootDir: string | null;
  label: string | null;
  port: number | null;
  startedAt: string | null;
  qaNotes: string | null;
  qaNotesFilePath: string | null;
};

export type DiscoveredBundler = {
  host: string;
  port: number;
  url: string;
  source: MetroDiscoverySource;
  metadata: MetroInfo | null;
  metadataStatus: 'loaded' | 'unavailable';
};

const PROBE_TIMEOUT_MS = 500;
const METRO_STATUS_BODY = 'packager-status:running';

type DiscoverBundlersOptions = {
  hosts: readonly string[];
  savedTargets?: readonly string[];
  ports?: readonly number[];
  timeoutMs?: number;
};

type Candidate = {
  host: string;
  port: number;
  source: MetroDiscoverySource;
};

type ParsedTarget =
  | {
      type: 'host';
      host: string;
    }
  | {
      type: 'url';
      host: string;
      port: number;
      url: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeMetroHost(value: string): string | null {
  const trimmed = value.trim().replace(/\.$/, '');
  if (!trimmed) return null;
  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes(':')) return null;
  if (!/^[a-zA-Z0-9.-]+$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function normalizeMetroTarget(value: string): string | null {
  const parsed = parseMetroTarget(value);
  if (!parsed) return null;
  return parsed.type === 'url' ? parsed.url : parsed.host;
}

function parseMetroTarget(value: string): ParsedTarget | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('://') && !trimmed.includes(':')) {
    const host = normalizeMetroHost(trimmed);
    return host ? { type: 'host', host } : null;
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:') return null;
  if (!url.hostname || !url.port) return null;

  const port = Number(url.port);
  if (!Number.isInteger(port) || port <= 0) return null;

  return {
    type: 'url',
    host: url.hostname.toLowerCase(),
    port,
    url: `http://${url.hostname.toLowerCase()}:${port}`,
  };
}

function parseMetroInfo(value: unknown): MetroInfo | null {
  if (!isRecord(value)) return null;
  const version = value.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) return null;

  return {
    version,
    branchName: nullableString(value.branchName),
    commitSha: nullableString(value.commitSha),
    rootDir: nullableString(value.rootDir),
    label: nullableString(value.label),
    port: nullableNumber(value.port),
    startedAt: nullableString(value.startedAt),
    qaNotes: nullableString(value.qaNotes),
    qaNotesFilePath: nullableString(value.qaNotesFilePath),
  };
}

export async function probeMetro(host: string, port: number, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/status`, {
      signal: createTimeoutSignal(timeoutMs),
    });
    if (!response.ok) return false;
    const body = await response.text();
    return body.includes(METRO_STATUS_BODY);
  } catch {
    return false;
  }
}

export async function fetchMetroInfo(
  host: string,
  port: number,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<MetroInfo | null> {
  try {
    const response = await fetch(`http://${host}:${port}/_boardsesh/metro-info`, {
      signal: createTimeoutSignal(timeoutMs),
    });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    return parseMetroInfo(json);
  } catch {
    return null;
  }
}

function buildCandidates(
  hosts: readonly string[],
  savedTargets: readonly string[],
  ports: readonly number[],
): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: Candidate) => {
    const key = `${candidate.host}:${candidate.port}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const hostValue of hosts) {
    const host = normalizeMetroHost(hostValue);
    if (!host) continue;
    for (const port of ports) {
      addCandidate({ host, port, source: 'embedded' });
    }
  }

  for (const targetValue of savedTargets) {
    const target = parseMetroTarget(targetValue);
    if (!target) continue;

    if (target.type === 'url') {
      addCandidate({ host: target.host, port: target.port, source: 'saved' });
      continue;
    }

    for (const port of ports) {
      addCandidate({ host: target.host, port, source: 'saved' });
    }
  }

  return candidates;
}

export async function discoverBundlers({
  hosts,
  savedTargets = [],
  ports = DEFAULT_METRO_PORTS,
  timeoutMs = PROBE_TIMEOUT_MS,
}: DiscoverBundlersOptions): Promise<DiscoveredBundler[]> {
  const candidates = buildCandidates(hosts, savedTargets, ports);
  const probes = candidates.map(async (candidate) => ({
    ...candidate,
    live: await probeMetro(candidate.host, candidate.port, timeoutMs),
  }));
  const results = await Promise.all(probes);
  const liveCandidates = results.filter((result) => result.live);

  return await Promise.all(
    liveCandidates.map(async ({ host, port, source }) => {
      const metadata = await fetchMetroInfo(host, port, timeoutMs);
      return {
        host,
        port,
        source,
        url: `http://${host}:${port}`,
        metadata,
        metadataStatus: metadata ? 'loaded' : 'unavailable',
      };
    }),
  );
}
