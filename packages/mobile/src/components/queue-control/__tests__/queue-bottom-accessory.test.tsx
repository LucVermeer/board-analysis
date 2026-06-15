// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import type { Climb, ClimbQueueItem } from '@boardsesh/queue';

const cfg = vi.hoisted(() => ({
  placement: 'regular' as 'regular' | 'inline',
  currentClimbQueueItem: { climb: { uuid: 'c1', name: 'Tea Magic', angle: 40 } } as unknown as ClimbQueueItem | null,
}));

vi.mock('expo-router/unstable-native-tabs', () => ({
  NativeTabs: { BottomAccessory: { usePlacement: () => cfg.placement } },
}));

vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 402, height: 874, scale: 3, fontScale: 1 }),
}));

vi.mock('../../../providers/queue-provider', () => ({
  useQueue: () => ({ state: { currentClimbQueueItem: cfg.currentClimbQueueItem } }),
}));
vi.mock('../../../theme/layout', () => ({
  glassSize: { standard: 56, inline: 44, capsule: 52 },
  NATIVE_BOTTOM_ACCESSORY_MAX_WIDTH: 344,
  NATIVE_BOTTOM_ACCESSORY_SCREEN_GUTTER: 32,
}));
// Stub the row so the test sees exactly what QueueBottomAccessory hands down, and
// so the row stub is the only node under the accessory (no extra wrapper).
vi.mock('../NativeAccessoryClimbRow', () => ({
  NativeAccessoryClimbRow: ({
    climb,
    placement,
    width,
  }: {
    climb: Climb;
    placement: 'regular' | 'inline';
    width: number;
  }) =>
    createElement('div', {
      'data-native-row': 'true',
      'data-climb-name': climb.name,
      'data-placement': placement,
      'data-row-width': String(width),
    }),
}));
// Board-presence source flip: identity passthrough (flag off / no wall feed), so
// the accessory render-gate keys on the local queue head exactly as today.
vi.mock('../use-wall-or-queue-climb', () => ({
  useWallOrQueueCurrentClimb: (localClimb: unknown) => localClimb,
  useIsWallPinned: () => false,
}));

import { QueueBottomAccessory } from '../QueueBottomAccessory';

describe('QueueBottomAccessory', () => {
  beforeEach(() => {
    cfg.placement = 'regular';
    cfg.currentClimbQueueItem = { climb: { uuid: 'c1', name: 'Tea Magic', angle: 40 } } as unknown as ClimbQueueItem;
  });

  it('renders the native accessory row with the resolved climb in regular placement', () => {
    const { container } = render(<QueueBottomAccessory />);
    const row = container.querySelector('[data-native-row="true"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-climb-name')).toBe('Tea Magic');
    expect(row?.getAttribute('data-placement')).toBe('regular');
  });

  it('hands the row straight to the platter with no extra wrapper node', () => {
    // A single top-level node keeps UIKit from relayouting a redundant nested box —
    // the doubled-text snapshot fed on the old double placement-height wrapper.
    const { container } = render(<QueueBottomAccessory />);
    expect(container.childNodes).toHaveLength(1);
    expect((container.firstChild as HTMLElement).getAttribute('data-native-row')).toBe('true');
  });

  it('passes the inline placement through at the same width as regular', () => {
    // max(56*2=112, min(344, 402-32=370)) = 344, independent of placement.
    const regular = render(<QueueBottomAccessory />);
    const regularRowWidth = regular.container.querySelector('[data-native-row]')?.getAttribute('data-row-width');
    regular.unmount();

    cfg.placement = 'inline';
    const inline = render(<QueueBottomAccessory />);
    const inlineRow = inline.container.querySelector('[data-native-row]');

    expect(inlineRow?.getAttribute('data-placement')).toBe('inline');
    expect(inlineRow?.getAttribute('data-row-width')).toBe(regularRowWidth);
    expect(inlineRow?.getAttribute('data-row-width')).toBe('344');
  });

  it('renders nothing without a current climb', () => {
    cfg.currentClimbQueueItem = null;
    const { container } = render(<QueueBottomAccessory />);
    expect(container.querySelector('[data-native-row]')).toBeNull();
    expect(container.childNodes).toHaveLength(0);
  });
});
