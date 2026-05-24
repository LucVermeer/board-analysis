/// <reference types="node" />

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOARDSESH_DIR = join(ROOT_DIR, '.boardsesh');
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

console.log(`[dev:mobile] Branch: ${branchName ?? '(detached)'}`);
if (qaNotes.filePath) {
  console.log(`[dev:mobile] QA notes: ${qaNotes.filePath}`);
}
console.log(`[dev:mobile] Metro log: .boardsesh/mobile-metro.log`);

mkdirSync(BOARDSESH_DIR, { recursive: true });
const logStream = createWriteStream(METRO_LOG_PATH, { flags: 'w' });

const childEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
if (branchName) childEnv.BOARDSESH_DEV_BRANCH_NAME = branchName;
if (qaNotes.contents) childEnv.BOARDSESH_DEV_QA_NOTES = qaNotes.contents;
if (qaNotes.filePath) childEnv.BOARDSESH_DEV_QA_NOTES_FILE = qaNotes.filePath;

const child: ChildProcess = spawn('bunx', ['expo', 'start', ...passthroughArgs], {
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
