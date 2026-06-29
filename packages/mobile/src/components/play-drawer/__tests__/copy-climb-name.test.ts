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
  };
}

describe('copyClimbName', () => {
  beforeEach(() => {
    clipboard.setStringAsync.mockClear();
  });

  it('copies the name and fires haptic, analytics, and toast', () => {
    const deps = makeDeps();
    const result = copyClimbName(
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

  it('no-ops when there is no climb', () => {
    const deps = makeDeps();
    const result = copyClimbName(null, { boardName: 'kilter', layoutId: 8 }, deps);

    expect(result).toBe(false);
    expect(clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(deps.haptic).not.toHaveBeenCalled();
    expect(deps.track).not.toHaveBeenCalled();
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it('no-ops on an empty name', () => {
    const deps = makeDeps();
    const result = copyClimbName({ name: '', uuid: 'climb-1' }, { boardName: 'tension', layoutId: 1 }, deps);

    expect(result).toBe(false);
    expect(clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(deps.showToast).not.toHaveBeenCalled();
  });
});
