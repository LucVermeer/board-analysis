import { describe, it, expect, vi, beforeEach } from 'vitest';

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async (_text: string) => {}) }));
vi.mock('expo-clipboard', () => ({ setStringAsync: clipboard.setStringAsync }));
vi.mock('@boardsesh/analytics', () => ({ SHARED_EVENTS: { ClimbShared: 'Climb Shared' } }));

import { copyClimbName } from '../copy-climb-name';

function makeDeps() {
  return {
    haptic: vi.fn(),
    track: vi.fn(),
    showToast: vi.fn(),
    toastMessage: 'Name copied',
    errorToastMessage: "Couldn't copy name",
  };
}

describe('copyClimbName', () => {
  beforeEach(() => {
    clipboard.setStringAsync.mockClear();
  });

  it('copies the name and fires haptic, analytics, and toast', async () => {
    const deps = makeDeps();
    const result = await copyClimbName(
      { name: 'Hueco Madness', uuid: 'climb-1' },
      { boardName: 'kilter', layoutId: 8 },
      deps,
    );

    expect(result).toBe(true);
    expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('Hueco Madness');
    expect(deps.haptic).toHaveBeenCalledTimes(1);
    expect(deps.track).toHaveBeenCalledWith('Climb Shared', {
      method: 'copy_name',
      climbUuid: 'climb-1',
      boardName: 'kilter',
      layoutId: 8,
    });
    expect(deps.showToast).toHaveBeenCalledWith('Name copied');
  });

  it('does not claim success when the clipboard write fails', async () => {
    const deps = makeDeps();
    clipboard.setStringAsync.mockRejectedValueOnce(new Error('clipboard unavailable'));

    const result = await copyClimbName(
      { name: 'Hueco Madness', uuid: 'climb-1' },
      { boardName: 'kilter', layoutId: 8 },
      deps,
    );

    expect(result).toBe(false);
    expect(deps.haptic).not.toHaveBeenCalled();
    expect(deps.track).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith("Couldn't copy name", 'error');
  });

  it('no-ops when there is no climb', async () => {
    const deps = makeDeps();
    const result = await copyClimbName(null, { boardName: 'kilter', layoutId: 8 }, deps);

    expect(result).toBe(false);
    expect(clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(deps.haptic).not.toHaveBeenCalled();
    expect(deps.track).not.toHaveBeenCalled();
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it('no-ops on an empty name', async () => {
    const deps = makeDeps();
    const result = await copyClimbName({ name: '', uuid: 'climb-1' }, { boardName: 'tension', layoutId: 1 }, deps);

    expect(result).toBe(false);
    expect(clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(deps.showToast).not.toHaveBeenCalled();
  });
});
