/// <reference types="node" />

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_STORE_CONNECT_API_BASE = 'https://api.appstoreconnect.apple.com';
const BUNDLE_ID = 'com.boardsesh.app';

// App Store states that indicate Apple has accepted the submission.
// Once the current version in app.config.ts appears in any of these states,
// we bump the patch so the next build gets a fresh marketing version.
const ACCEPTED_APP_STORE_STATES = [
  'PENDING_DEVELOPER_RELEASE',
  'PENDING_APPLE_RELEASE',
  'PROCESSING_FOR_APP_STORE',
  'READY_FOR_SALE',
].join(',');

type AppStoreJwtInput = {
  keyId: string;
  issuerId: string;
  privateKey: string;
  nowSeconds?: number;
  expiresInSeconds?: number;
};

type AppResource = {
  type: 'apps';
  id: string;
  attributes?: { bundleId?: string };
};

type AppStoreVersionResource = {
  type: 'appStoreVersions';
  id: string;
  attributes?: {
    versionString?: string;
    appStoreState?: string;
  };
};

type JsonApiCollectionResponse<T> = {
  data: T[];
};

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function createAppStoreConnectJwt(input: AppStoreJwtInput): string {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds = input.expiresInSeconds ?? 20 * 60;
  const header = { alg: 'ES256', kid: input.keyId, typ: 'JWT' };
  const payload = {
    aud: 'appstoreconnect-v1',
    exp: nowSeconds + expiresInSeconds,
    iat: nowSeconds,
    iss: input.issuerId,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = createSign('sha256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: input.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function decodePrivateKey(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.includes('BEGIN PRIVATE KEY') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function ascFetch<T>(path: string, token: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, APP_STORE_CONNECT_API_BASE);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`ASC ${path} → ${response.status}: ${body.slice(0, 500)}`);
  }
  return JSON.parse(body) as T;
}

async function resolveAppId(token: string): Promise<string> {
  const data = await ascFetch<JsonApiCollectionResponse<AppResource>>('/v1/apps', token, {
    'filter[bundleId]': BUNDLE_ID,
    'fields[apps]': 'bundleId',
    limit: '1',
  });
  const app = data.data[0];
  if (!app) throw new Error(`No ASC app found for ${BUNDLE_ID}`);
  return app.id;
}

async function getAcceptedVersionStrings(token: string, appId: string): Promise<string[]> {
  const data = await ascFetch<JsonApiCollectionResponse<AppStoreVersionResource>>(
    `/v1/apps/${appId}/appStoreVersions`,
    token,
    {
      'filter[appStoreState]': ACCEPTED_APP_STORE_STATES,
      'fields[appStoreVersions]': 'versionString,appStoreState',
      limit: '10',
    },
  );
  return data.data
    .map((v) => v.attributes?.versionString)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function emitOutput(name: string, value: string): void {
  const githubOutput = process.env['GITHUB_OUTPUT'];
  if (githubOutput) {
    appendFileSync(githubOutput, `${name}=${value}\n`);
  }
  console.log(`output: ${name}=${value}`);
}

async function main(): Promise<number> {
  try {
    const dryRun = process.env['DRY_RUN'] === 'true';

    const token = createAppStoreConnectJwt({
      keyId: getRequiredEnv('APP_STORE_CONNECT_API_KEY_ID'),
      issuerId: getRequiredEnv('APP_STORE_CONNECT_ISSUER_ID'),
      privateKey: decodePrivateKey(getRequiredEnv('APP_STORE_CONNECT_API_KEY_BASE64')),
    });

    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const appConfigPath = join(scriptDir, '..', 'packages', 'mobile', 'app.config.ts');
    const content = readFileSync(appConfigPath, 'utf-8');

    const versionMatch = content.match(/version:\s*'(\d+)\.(\d+)\.(\d+)'/);
    if (!versionMatch) {
      throw new Error(`Could not find version field in ${appConfigPath}`);
    }
    const [, major, minor, patch] = versionMatch;
    const currentVersion = `${major}.${minor}.${patch}`;
    console.log(`Current marketing version: ${currentVersion}`);

    const appId = await resolveAppId(token);
    const accepted = await getAcceptedVersionStrings(token, appId);
    console.log(`Accepted App Store versions: ${accepted.length > 0 ? accepted.join(', ') : 'none'}`);

    if (!accepted.includes(currentVersion)) {
      console.log(`${currentVersion} is not yet in an accepted state — nothing to bump.`);
      emitOutput('bumped', 'false');
      return 0;
    }

    const newVersion = `${major}.${minor}.${parseInt(patch, 10) + 1}`;
    console.log(`${currentVersion} is accepted → ${dryRun ? 'would bump' : 'bumping'} to ${newVersion}`);

    if (dryRun) {
      emitOutput('bumped', 'false');
      emitOutput('new_version', newVersion);
      return 0;
    }

    const updated = content.replace(/version:\s*'(\d+\.\d+\.\d+)'/, `version: '${newVersion}'`);
    writeFileSync(appConfigPath, updated, 'utf-8');
    console.log(`Wrote ${newVersion} to ${appConfigPath}`);

    emitOutput('bumped', 'true');
    emitOutput('new_version', newVersion);
    return 0;
  } catch (err) {
    console.error(`[mobile-auto-version-bump] ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().then((exitCode) => process.exit(exitCode));
}
