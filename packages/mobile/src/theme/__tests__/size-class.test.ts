import { describe, it, expect } from 'vitest';
import {
  resolveDeviceLayout,
  resolveWallSurface,
  resolveDetailPaneSurface,
  resolveDetailPaneWidth,
  REGULAR_WIDTH_BREAKPOINT,
  EXPANDED_WIDTH_BREAKPOINT,
} from '../size-class';

const SIDEBAR_WIDTH = 96;

describe('resolveDeviceLayout', () => {
  it('keeps every iPhone compact regardless of width', () => {
    // An iPhone is never an iPad, so even a wide landscape phone stays compact
    // (renders the phone UI verbatim).
    expect(resolveDeviceLayout({ width: 932, isPad: false })).toEqual({ widthClass: 'compact', expanded: false });
    expect(resolveDeviceLayout({ width: 430, isPad: false })).toEqual({ widthClass: 'compact', expanded: false });
  });

  it('keeps an iPad compact in a narrow split (Slide Over / ⅓ / ½)', () => {
    // 12.9" iPad split widths: Slide Over ~320, ½ ~507, ⅔ ~664 — all below 700.
    for (const width of [320, 375, 507, 664, REGULAR_WIDTH_BREAKPOINT - 1]) {
      expect(resolveDeviceLayout({ width, isPad: true })).toEqual({ widthClass: 'compact', expanded: false });
    }
  });

  it('is regular but not expanded for a narrow-regular iPad window', () => {
    // 11" iPad portrait (834) and a ⅔ split that clears 700 but not 1024.
    expect(resolveDeviceLayout({ width: 834, isPad: true })).toEqual({ widthClass: 'regular', expanded: false });
    expect(resolveDeviceLayout({ width: REGULAR_WIDTH_BREAKPOINT, isPad: true })).toEqual({
      widthClass: 'regular',
      expanded: false,
    });
    expect(resolveDeviceLayout({ width: EXPANDED_WIDTH_BREAKPOINT - 1, isPad: true })).toEqual({
      widthClass: 'regular',
      expanded: false,
    });
  });

  it('is regular but not expanded across the tightest real iPad portraits', () => {
    // iPad mini portrait (744), 9.7"/10.2" portrait (768/810) — the narrow-regular
    // band where a persistent detail pane squeezes the browse list. All clear 700
    // (sidebar shows) but not 1024 (no master+detail). See resolveDetailPaneSurface.
    for (const width of [744, 768, 810]) {
      expect(resolveDeviceLayout({ width, isPad: true })).toEqual({ widthClass: 'regular', expanded: false });
    }
  });

  it('is expanded for a full-screen iPad (portrait 1024+ and any landscape)', () => {
    for (const width of [EXPANDED_WIDTH_BREAKPOINT, 1194, 1366]) {
      expect(resolveDeviceLayout({ width, isPad: true })).toEqual({ widthClass: 'regular', expanded: true });
    }
  });
});

describe('resolveWallSurface', () => {
  it('shows no wall surface at compact width (phone UI owns its own wall chrome)', () => {
    for (const width of [320, 507, 664, 932]) {
      expect(resolveWallSurface({ width, widthClass: 'compact', sidebarWidth: SIDEBAR_WIDTH })).toBe('none');
    }
  });

  it('shows a strip in portrait, where a 4th column would crush the list', () => {
    // 11" portrait 834 → 118pt list; 13" portrait 1032 → 316pt list — both below the floor.
    expect(resolveWallSurface({ width: 834, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('strip');
    expect(resolveWallSurface({ width: 1032, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('strip');
  });

  it('shows a dedicated column in landscape on both iPad sizes', () => {
    // Wall column stays fixed at 300pt; content + detail split the remaining width.
    // 11" landscape 1194 → 399/399pt; 13" landscape 1366 → 485/485pt.
    expect(resolveWallSurface({ width: 1194, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('column');
    expect(resolveWallSurface({ width: 1366, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('column');
  });

  it('flips strip→column exactly at the content floor', () => {
    // balancedContentWidth = (width - 96 - 300) / 2; column requires >= 390 → width >= 1176.
    expect(resolveWallSurface({ width: 1175, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('strip');
    expect(resolveWallSurface({ width: 1176, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('column');
  });
});

describe('resolveDetailPaneWidth', () => {
  it('splits content and detail evenly when the wall column is visible', () => {
    expect(resolveDetailPaneWidth({ width: 1366, sidebarWidth: SIDEBAR_WIDTH, wallColumnVisible: true })).toBe(485);
    expect(resolveDetailPaneWidth({ width: 1194, sidebarWidth: SIDEBAR_WIDTH, wallColumnVisible: true })).toBe(399);
  });

  it('uses the standalone detail-pane clamp when the wall column is hidden', () => {
    expect(resolveDetailPaneWidth({ width: 744, sidebarWidth: SIDEBAR_WIDTH, wallColumnVisible: false })).toBe(320);
    expect(resolveDetailPaneWidth({ width: 1024, sidebarWidth: SIDEBAR_WIDTH, wallColumnVisible: false })).toBe(348);
    expect(resolveDetailPaneWidth({ width: 1366, sidebarWidth: SIDEBAR_WIDTH, wallColumnVisible: false })).toBe(400);
  });
});

describe('resolveDetailPaneSurface', () => {
  it('uses the compact sheet outside regular iPad width', () => {
    expect(resolveDetailPaneSurface({ width: 932, widthClass: 'compact', sidebarWidth: SIDEBAR_WIDTH })).toBe('sheet');
  });

  it('suppresses the pane when the browse list would fall below the readable floor', () => {
    expect(resolveDetailPaneSurface({ width: 744, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('sheet');
    expect(resolveDetailPaneSurface({ width: 815, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('sheet');
  });

  it('mounts the pane once the browse list clears the readable floor', () => {
    expect(resolveDetailPaneSurface({ width: 816, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('pane');
    expect(resolveDetailPaneSurface({ width: 834, widthClass: 'regular', sidebarWidth: SIDEBAR_WIDTH })).toBe('pane');
  });
});
