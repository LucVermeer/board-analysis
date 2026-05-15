import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const posthogMocks = vi.hoisted(() => ({
  PostHog: vi.fn(),
  capture: vi.fn(),
  on: vi.fn(),
  shutdown: vi.fn(),
}));

vi.mock('posthog-node', () => ({
  PostHog: posthogMocks.PostHog,
}));

async function loadPosthogModule(): Promise<typeof import('../services/analytics/posthog')> {
  vi.resetModules();
  const posthogModule = await import('../services/analytics/posthog');
  posthogModule.__resetPosthogForTests();
  return posthogModule;
}

describe('backend PostHog analytics helper', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    posthogMocks.PostHog.mockImplementation(function MockPostHog() {
      return {
        capture: posthogMocks.capture,
        on: posthogMocks.on,
        shutdown: posthogMocks.shutdown,
      };
    });
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('does not initialize or capture without POSTHOG_PROJECT_KEY', async () => {
    const { captureBackendEvent } = await loadPosthogModule();

    const captured = captureBackendEvent('Live Activity Started', {
      distinctId: 'user-1',
      properties: { sessionId: 'session-1' },
    });

    expect(captured).toBe(false);
    expect(posthogMocks.PostHog).not.toHaveBeenCalled();
    expect(posthogMocks.capture).not.toHaveBeenCalled();
  });

  it('captures sanitized events with backend metadata', async () => {
    vi.stubEnv('POSTHOG_PROJECT_KEY', 'ph_project');
    vi.stubEnv('POSTHOG_HOST', 'https://posthog.example');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'production');
    const { captureBackendEvent } = await loadPosthogModule();

    const captured = captureBackendEvent('Live Activity Widget Navigation', {
      distinctId: 'user-1',
      properties: {
        sessionId: 'session-1',
        outcome: 'success',
        targetIndex: 2,
        dropped: undefined,
      },
    });

    expect(captured).toBe(true);
    expect(posthogMocks.PostHog).toHaveBeenCalledWith('ph_project', {
      host: 'https://posthog.example',
      flushAt: 20,
      flushInterval: 10_000,
      disableGeoip: true,
    });
    expect(posthogMocks.capture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'Live Activity Widget Navigation',
      properties: {
        sessionId: 'session-1',
        outcome: 'success',
        targetIndex: 2,
        service: 'boardsesh-backend',
        environment: 'production',
      },
    });
  });

  it('can disable PostHog person profiles for aggregate events', async () => {
    vi.stubEnv('POSTHOG_PROJECT_KEY', 'ph_project');
    const { captureBackendEvent } = await loadPosthogModule();

    captureBackendEvent('Live Activity Push Delivery', {
      distinctId: 'live-activity-session:session-1',
      processPersonProfile: false,
      properties: { sentCount: 1 },
    });

    expect(posthogMocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          sentCount: 1,
          $process_person_profile: false,
        }),
      }),
    );
  });

  it('logs and returns false when capture throws', async () => {
    vi.stubEnv('POSTHOG_PROJECT_KEY', 'ph_project');
    posthogMocks.capture.mockImplementation(() => {
      throw new Error('capture exploded');
    });
    const { captureBackendEvent } = await loadPosthogModule();

    const captured = captureBackendEvent('Live Activity Started', {
      distinctId: 'user-1',
    });

    expect(captured).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[PostHog] Capture failed:', expect.any(Error));
  });

  it('flushes the client on shutdown', async () => {
    vi.stubEnv('POSTHOG_PROJECT_KEY', 'ph_project');
    const { captureBackendEvent, shutdownPosthog } = await loadPosthogModule();
    captureBackendEvent('Live Activity Started', { distinctId: 'user-1' });

    await shutdownPosthog();

    expect(posthogMocks.shutdown).toHaveBeenCalledOnce();
  });
});
