import { describe, expect, it } from 'vitest';
import { getBleLightbulbAccessibilityHint, getBleLightbulbVisualState } from '../ble-lightbulb-button-state';

describe('BleLightbulbButton state helpers', () => {
  it('uses the outline lightbulb and neutral color when disconnected', () => {
    expect(
      getBleLightbulbVisualState({
        isConnected: false,
        connectedColor: '#ffcc00',
        disconnectedColor: '#8e8e93',
      }),
    ).toEqual({
      iconName: 'lightbulb',
      iconColor: '#8e8e93',
    });
  });

  it('uses the filled lightbulb and glow colors when connected', () => {
    expect(
      getBleLightbulbVisualState({
        isConnected: true,
        connectedColor: '#ffcc00',
        disconnectedColor: '#8e8e93',
      }),
    ).toEqual({
      iconName: 'lightbulb.fill',
      iconColor: '#ffcc00',
      backgroundColor: '#ffcc0024',
      shadowColor: '#ffcc00',
    });
  });

  it('only exposes the scanning hint while scanning', () => {
    expect(getBleLightbulbAccessibilityHint(true, 'Scanning for boards nearby')).toBe('Scanning for boards nearby');
    expect(getBleLightbulbAccessibilityHint(false, 'Scanning for boards nearby')).toBeUndefined();
  });
});
