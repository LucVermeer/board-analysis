/// <reference types="node" />

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveTailscaleHostname } from './lib/tailscale-hostname';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const METRO_DEFAULT_PORT = '8081';
const BOARDSESH_DIR = join(ROOT_DIR, '.boardsesh');

function resolveMetroPort(args: string[]): string {
  let port = METRO_DEFAULT_PORT;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--port' || argument === '-p') {
      const next = args[index + 1];
      if (next && !next.startsWith('-')) port = next;
    } else if (argument.startsWith('--port=')) {
      port = argument.slice('--port='.length);
    }
  }
  return port;
}
const METRO_LOG_PATH = join(BOARDSESH_DIR, 'mobile-metro.log');
const DEFAULT_QA_NOTES_PATH = join(BOARDSESH_DIR, 'qa-notes.md');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string[]): { qaNotesFilePath: string | null; passthroughArgs: string[] } {
  let qaNotesFilePath: string | null = null;
  const passthroughArgs: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--') continue;

    if (argument === '--qa-notes-file' || argument === '--qa-plan-file') {
      const nextArgument = args[index + 1];
      if (!nextArgument || nextArgument.startsWith('--')) {
        throw new Error(`${argument} requires a file path`);
      }
      qaNotesFilePath = nextArgument;
      index++;
      continue;
    }

    for (const prefix of ['--qa-notes-file=', '--qa-plan-file=']) {
      if (argument.startsWith(prefix)) {
        const pathValue = argument.slice(prefix.length).trim();
        if (!pathValue) {
          throw new Error(`${prefix.slice(0, -1)} requires a file path`);
        }
        qaNotesFilePath = pathValue;
        break;
      }
    }

    if (argument.startsWith('--qa-notes-file=') || argument.startsWith('--qa-plan-file=')) {
      continue;
    }

    passthroughArgs.push(argument);
  }

  return { qaNotesFilePath, passthroughArgs };
}

// ---------------------------------------------------------------------------
// Resolve dev metadata (branch name, QA notes)
// ---------------------------------------------------------------------------

function resolveCurrentBranchName(): string | null {
  try {
    const branchName = execFileSync('git', ['branch', '--show-current'], {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return branchName || null;
  } catch {
    return null;
  }
}

function resolveQaNotes(explicitPath: string | null): { contents: string | null; filePath: string | null } {
  const resolvedPath = explicitPath
    ? resolve(ROOT_DIR, explicitPath)
    : existsSync(DEFAULT_QA_NOTES_PATH)
      ? DEFAULT_QA_NOTES_PATH
      : null;

  if (!resolvedPath) return { contents: null, filePath: null };

  try {
    const contents = readFileSync(resolvedPath, 'utf-8').trim();
    return { contents: contents || null, filePath: resolvedPath };
  } catch (error) {
    if (explicitPath) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read --qa-notes-file at ${resolvedPath}: ${message}`);
    }
    return { contents: null, filePath: null };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { qaNotesFilePath: cliQaNotesPath, passthroughArgs } = parseArgs(process.argv.slice(2));
const branchName = resolveCurrentBranchName();
const qaNotes = resolveQaNotes(cliQaNotesPath);
const tailscale = resolveTailscaleHostname();
const metroPort = resolveMetroPort(passthroughArgs);

console.log(`[dev:mobile] Branch: ${branchName ?? '(detached)'}`);
if (qaNotes.filePath) {
  console.log(`[dev:mobile] QA notes: ${qaNotes.filePath}`);
}
console.log(`[dev:mobile] Hostname: ${tailscale.hostname} (${tailscale.source})`);
if (tailscale.reason) {
  console.log(`[dev:mobile] ${tailscale.reason}`);
}
if (tailscale.source !== 'fallback') {
  console.log(`[dev:mobile] Metro: http://${tailscale.hostname}:${metroPort}`);
}
console.log(`[dev:mobile] Metro log: .boardsesh/mobile-metro.log`);

mkdirSync(BOARDSESH_DIR, { recursive: true });
const logStream = createWriteStream(METRO_LOG_PATH, { flags: 'w' });

const childEnv: NodeJS.ProcessEnv = { ...process.env };
if (branchName) childEnv.BOARDSESH_DEV_BRANCH_NAME = branchName;
if (qaNotes.contents) childEnv.BOARDSESH_DEV_QA_NOTES = qaNotes.contents;
if (qaNotes.filePath) childEnv.BOARDSESH_DEV_QA_NOTES_FILE = qaNotes.filePath;
if (tailscale.source !== 'fallback') {
  childEnv.REACT_NATIVE_PACKAGER_HOSTNAME = tailscale.hostname;
}

// Bind Metro on 0.0.0.0 (Expo's --host lan) so devices on the same Tailnet can
// reach the bundler. Respect a user-supplied --host so manual overrides win.
const userPassedHost = passthroughArgs.some((arg) => arg === '--host' || arg.startsWith('--host='));
// We ship a custom dev client (EAS preview-build flow); Metro must serve the
// dev-client bundle, not the Expo Go one. Opt out by passing --go.
const userPickedClient = passthroughArgs.some(
  (arg) => arg === '--dev-client' || arg === '--go' || arg.startsWith('--dev-client=') || arg.startsWith('--go='),
);
const expoArgs = [
  'expo',
  'start',
  ...(userPassedHost ? [] : ['--host', 'lan']),
  ...(userPickedClient ? [] : ['--dev-client']),
  ...passthroughArgs,
];

const child = spawn('bunx', expoArgs, {
  cwd: join(ROOT_DIR, 'packages', 'mobile'),
  env: childEnv,
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout!.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});

child.stderr!.on('data', (chunk: Buffer) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

const forwardSignal = (signal: NodeJS.Signals) => {
  child.kill(signal);
};
process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

child.on('close', (exitCode: number | null) => {
  logStream.end();
  process.exit(exitCode ?? 1);
});
