/// <reference types="node" />

/**
 * Automated native screenshot capture for packages/mobile.
 *
 * Boots a simulator, applies a clean status bar, builds + installs a clean
 * Release app (no Expo dev-menu bubble) with EXPO_PUBLIC_SCREENSHOT_MODE=1, runs
 * a Maestro flow that deep-links to each screen and captures it, then collects
 * the PNGs into mobile/screenshots/<platform>/<device>/.
 *
 * Usage:
 *   vp run mobile:screenshots -- [--platform ios] [--flow app-store|onboarding]
 *                                 [--backend local|prod] [--device "iPhone 16 Pro Max"]
 *                                 [--variant material|liquidGlass] [--shutdown]
 *
 * Requires: macOS + Xcode simulators, and Maestro (https://maestro.mobile.dev).
 * For --backend local, bring up the seeded dev DB + backend first (`vp run dev`).
 * Credentials come from SCREENSHOT_USER_EMAIL / SCREENSHOT_USER_PASSWORD
 * (default test@boardsesh.com / test).
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_DIR = resolve(ROOT_DIR, 'packages', 'mobile');
const MAESTRO_DIR = resolve(MOBILE_DIR, '.maestro');
const IOS_RUN_SCRIPT = resolve(ROOT_DIR, 'scripts', 'mobile-ios-run.ts');
const OUTPUT_ROOT = resolve(ROOT_DIR, 'mobile', 'screenshots');
const LOG = '[mobile:screenshots]';

const APP_ID = 'com.boardsesh.app';
const DEFAULT_IOS_DEVICE = 'iPhone 16 Pro Max';
const IOS_DEVICE_TYPE_ID = 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max';
// Mirrors packages/mobile/.env.example. iOS simulators reach the host directly,
// so localhost is correct for a sim build pointed at the local dev backend.
const LOCAL_BACKEND_URL = 'http://localhost:8080';
const LOCAL_WEB_URL = 'http://localhost:3000';
const DEFAULT_USER_EMAIL = 'test@boardsesh.com';
const DEFAULT_USER_PASSWORD = 'test';
const MAESTRO_INSTALL_HINT = 'Install Maestro: curl -Ls "https://get.maestro.mobile.dev" | bash';

export type ScreenshotPlatform = 'ios' | 'android' | 'all';
export type ScreenshotFlow = 'app-store' | 'onboarding';
export type ScreenshotBackend = 'local' | 'prod';

export type ScreenshotTheme = 'light' | 'dark';

export interface ScreenshotOptions {
  platform: ScreenshotPlatform;
  flow: ScreenshotFlow;
  backend: ScreenshotBackend;
  device: string;
  variant: string | null;
  theme: ScreenshotTheme;
  shutdown: boolean;
}

export function parseArgs(argv: readonly string[]): ScreenshotOptions {
  const args = argv.filter((argument) => argument !== '--');
  const options: ScreenshotOptions = {
    platform: 'ios',
    flow: 'app-store',
    backend: 'local',
    device: DEFAULT_IOS_DEVICE,
    variant: null,
    // Dark is the canonical store appearance (the app defaults to dark).
    theme: 'dark',
    shutdown: false,
  };

  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[index + 1];
    switch (flag) {
      case '--platform':
        options.platform = expectEnum(flag, value, ['ios', 'android', 'all']) as ScreenshotPlatform;
        index++;
        break;
      case '--flow':
        options.flow = expectEnum(flag, value, ['app-store', 'onboarding']) as ScreenshotFlow;
        index++;
        break;
      case '--backend':
        options.backend = expectEnum(flag, value, ['local', 'prod']) as ScreenshotBackend;
        index++;
        break;
      case '--device':
        options.device = expectValue(flag, value);
        index++;
        break;
      case '--variant':
        options.variant = expectEnum(flag, value, ['material', 'liquidGlass']);
        index++;
        break;
      case '--theme':
        options.theme = expectEnum(flag, value, ['light', 'dark']) as ScreenshotTheme;
        index++;
        break;
      case '--shutdown':
        options.shutdown = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

function expectValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function expectEnum(flag: string, value: string | undefined, allowed: readonly string[]): string {
  const resolved = expectValue(flag, value);
  if (!allowed.includes(resolved)) {
    throw new Error(`${flag} must be one of: ${allowed.join(', ')} (got "${resolved}")`);
  }
  return resolved;
}

/** Slug used in the output path, e.g. "iPhone 16 Pro Max" -> "iphone-16-pro-max". */
export function deviceSlug(deviceName: string): string {
  return deviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the env for the Release build. Always sets screenshot mode; for
 * --backend local it points the build at the local dev backend unless the caller
 * already exported an override. --backend prod leaves the URLs unset so the app's
 * production defaults apply.
 */
export function buildScreenshotEnv(
  options: ScreenshotOptions,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    EXPO_PUBLIC_SCREENSHOT_MODE: '1',
    // Baked at JS-bundle time; theme-provider locks to it in screenshot mode.
    EXPO_PUBLIC_SCREENSHOT_THEME: options.theme,
  };
  if (options.variant) {
    env.EXPO_PUBLIC_SCREENSHOT_VARIANT = options.variant;
  }
  if (options.backend === 'local') {
    env.EXPO_PUBLIC_BACKEND_URL = env.EXPO_PUBLIC_BACKEND_URL ?? LOCAL_BACKEND_URL;
    env.EXPO_PUBLIC_WEB_URL = env.EXPO_PUBLIC_WEB_URL ?? LOCAL_WEB_URL;
  }
  return env;
}

interface DeviceInfo {
  udid: string;
  name: string;
  state: string;
}

function runInherit(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string = ROOT_DIR): number {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  return result.status ?? 1;
}

function runCapture(command: string, args: string[]): { status: number; stdout: string } {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

function commandExists(command: string): boolean {
  return spawnSync('command', ['-v', command], { shell: true, stdio: 'ignore' }).status === 0;
}

/** All simulator devices, flattened across runtimes. */
function listSimulatorDevices(): DeviceInfo[] {
  const { status, stdout } = runCapture('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (status !== 0) return [];
  const parsed = JSON.parse(stdout) as { devices: Record<string, Array<DeviceInfo & { isAvailable?: boolean }>> };
  const devices: DeviceInfo[] = [];
  for (const runtimeDevices of Object.values(parsed.devices)) {
    for (const device of runtimeDevices) {
      if (device.isAvailable === false) continue;
      devices.push({ udid: device.udid, name: device.name, state: device.state });
    }
  }
  return devices;
}

/** Newest available iOS runtime identifier (for creating a missing device). */
function newestIosRuntime(): string | null {
  const { status, stdout } = runCapture('xcrun', ['simctl', 'list', 'runtimes', '--json']);
  if (status !== 0) return null;
  const parsed = JSON.parse(stdout) as {
    runtimes: Array<{ identifier: string; isAvailable?: boolean; platform?: string; version?: string }>;
  };
  const ios = parsed.runtimes
    .filter((runtime) => runtime.isAvailable !== false && /iOS/i.test(runtime.identifier))
    .sort((a, b) => (a.version ?? '').localeCompare(b.version ?? '', undefined, { numeric: true }));
  return ios.length > 0 ? ios[ios.length - 1].identifier : null;
}

function findOrCreateIosDevice(deviceName: string): DeviceInfo {
  const devices = listSimulatorDevices();
  const booted = devices.find((device) => device.name === deviceName && device.state === 'Booted');
  if (booted) return booted;
  const existing = devices.find((device) => device.name === deviceName);
  if (existing) return existing;

  const runtime = newestIosRuntime();
  if (!runtime) {
    throw new Error(
      `No "${deviceName}" simulator found and no iOS runtime available to create one. Open Xcode > Settings > Components to install a simulator runtime, or create the device in Xcode.`,
    );
  }
  console.log(`${LOG} Creating simulator "${deviceName}" (${runtime})...`);
  const { status } = runCapture('xcrun', ['simctl', 'create', deviceName, IOS_DEVICE_TYPE_ID, runtime]);
  if (status !== 0) {
    throw new Error(`Failed to create simulator "${deviceName}". Create it manually in Xcode and rerun.`);
  }
  const created = listSimulatorDevices().find((device) => device.name === deviceName);
  if (!created) throw new Error(`Created "${deviceName}" but could not locate it afterwards.`);
  return created;
}

function bootDevice(device: DeviceInfo): void {
  if (device.state !== 'Booted') {
    console.log(`${LOG} Booting ${device.name} (${device.udid})...`);
    // `boot` errors if already booted; ignore that specific case.
    runCapture('xcrun', ['simctl', 'boot', device.udid]);
  }
  runCapture('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  // Bring up the Simulator window so Maestro's iOS driver has a foreground app.
  spawnSync('open', ['-a', 'Simulator'], { stdio: 'ignore' });
}

function applyCleanStatusBar(udid: string): void {
  runCapture('xcrun', [
    'simctl',
    'status_bar',
    udid,
    'override',
    '--time',
    '9:41',
    '--batteryState',
    'charged',
    '--batteryLevel',
    '100',
    '--cellularBars',
    '4',
    '--wifiBars',
    '3',
    '--dataNetwork',
    'wifi',
  ]);
}

function clearStatusBar(udid: string): void {
  runCapture('xcrun', ['simctl', 'status_bar', udid, 'clear']);
}

/** True once the app bundle is installed on the simulator. */
function appInstalled(udid: string): boolean {
  return runCapture('xcrun', ['simctl', 'get_app_container', udid, APP_ID, 'app']).status === 0;
}

function collectScreenshots(captureDir: string, platform: 'ios' | 'android', deviceName: string): string[] {
  const outputDir = join(OUTPUT_ROOT, platform, deviceSlug(deviceName));
  mkdirSync(outputDir, { recursive: true });
  const pngs = readdirSync(captureDir).filter((file) => file.toLowerCase().endsWith('.png'));
  for (const png of pngs) {
    cpSync(join(captureDir, png), join(outputDir, png));
  }
  return pngs.map((png) => join(outputDir, png));
}

function runIos(options: ScreenshotOptions): number {
  if (!commandExists('xcrun') || runCapture('xcrun', ['simctl', 'help']).status !== 0) {
    console.log(`${LOG} Skipped: iOS simulator tooling (xcrun simctl) not available.`);
    return 0;
  }
  if (!commandExists('maestro')) {
    console.error(`${LOG} FAILED: Maestro not found on PATH. ${MAESTRO_INSTALL_HINT}`);
    return 1;
  }

  const device = findOrCreateIosDevice(options.device);
  bootDevice(device);
  applyCleanStatusBar(device.udid);

  const buildEnv = buildScreenshotEnv(options);
  console.log(
    `${LOG} Building Release app for ${device.name} (backend=${options.backend}, theme=${options.theme}, flow=${options.flow}${options.variant ? `, variant=${options.variant}` : ''})...`,
  );
  const runBuild = (): number =>
    runInherit('bunx', ['tsx', IOS_RUN_SCRIPT, '--', '--configuration', 'Release', '--device', device.udid], buildEnv);
  let buildStatus = runBuild();
  if (buildStatus !== 0 && !appInstalled(device.udid)) {
    // RN New Architecture codegen ("Generate Specs") can race the compile step
    // on a cold/clean build, failing with "Build input file cannot be found:
    // …/ReactCodegen/*-generated.mm". The specs are written during that first
    // attempt, so a second build finds them — the well-known "build twice on a
    // clean checkout" quirk. This bites every fresh CI runner, so retry once.
    console.log(`${LOG} First build did not install the app (likely the cold-build codegen race); retrying once...`);
    buildStatus = runBuild();
  }
  // Gate on the app actually being installed, not on expo's exit code: for a
  // Release build, `expo run:ios` succeeds at build+install but then fails its
  // post-install launch step (it opens the app via the dev-client URL, which a
  // Release build doesn't handle — `simctl openurl` times out). Maestro launches
  // the app itself, so that launch-step failure is harmless.
  if (!appInstalled(device.udid)) {
    console.error(`${LOG} FAILED: app not installed after build (exit ${buildStatus}).`);
    return buildStatus === 0 ? 1 : buildStatus;
  }
  if (buildStatus !== 0) {
    console.log(`${LOG} Build + install OK; ignoring expo's post-install launch step (Maestro launches the app).`);
  }

  // Reset the simulator keychain so the app launches signed out and login runs
  // against the target backend. The auth token lives in a shared keychain access
  // group (group.com.boardsesh.app) that survives both `clearState` and an app
  // uninstall — so without this a stale token (e.g. from a previous --backend
  // local run) makes login skip and the app talk to the wrong backend with an
  // invalid session. The login subflow re-authenticates from a clean slate.
  console.log(`${LOG} Resetting simulator keychain (clears any stale auth token)...`);
  runCapture('xcrun', ['simctl', 'keychain', device.udid, 'reset']);

  const captureDir = mkdtempSync(join(tmpdir(), 'boardsesh-shots-'));
  try {
    const flowFile = join(MAESTRO_DIR, `${options.flow}.yaml`);
    if (!existsSync(flowFile)) {
      console.error(`${LOG} FAILED: flow not found: ${flowFile}`);
      return 1;
    }
    const email = process.env.SCREENSHOT_USER_EMAIL ?? DEFAULT_USER_EMAIL;
    const password = process.env.SCREENSHOT_USER_PASSWORD ?? DEFAULT_USER_PASSWORD;
    console.log(`${LOG} Running Maestro flow ${options.flow} on ${device.udid}...`);
    const maestroStatus = runInherit(
      'maestro',
      [
        '--device',
        device.udid,
        'test',
        flowFile,
        '-e',
        `SCREENSHOT_USER_EMAIL=${email}`,
        '-e',
        `SCREENSHOT_USER_PASSWORD=${password}`,
      ],
      process.env,
      captureDir,
    );
    if (maestroStatus !== 0) {
      console.error(`${LOG} FAILED: Maestro exited with ${maestroStatus}.`);
      return maestroStatus;
    }

    const saved = collectScreenshots(captureDir, 'ios', device.name);
    if (saved.length === 0) {
      console.error(`${LOG} WARNING: flow completed but no PNGs were captured.`);
      return 1;
    }
    console.log(`${LOG} Saved ${saved.length} screenshot(s) to mobile/screenshots/ios/${deviceSlug(device.name)}/`);
    for (const file of saved) console.log(`${LOG}   ${file}`);
  } finally {
    rmSync(captureDir, { force: true, recursive: true });
    clearStatusBar(device.udid);
    if (options.shutdown) {
      runCapture('xcrun', ['simctl', 'shutdown', device.udid]);
    }
  }

  return 0;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let options: ScreenshotOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${LOG} ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (options.platform === 'android' || options.platform === 'all') {
    console.error(
      `${LOG} Android capture isn't wired up yet — the iOS pipeline lands first. Rerun with --platform ios.`,
    );
    return 1;
  }

  try {
    return runIos(options);
  } catch (error) {
    console.error(`${LOG} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
