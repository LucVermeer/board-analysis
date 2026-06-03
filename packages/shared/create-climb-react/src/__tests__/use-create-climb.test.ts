import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCreateClimb } from '../use-create-climb';

vi.mock('@boardsesh/board-constants/hold-states', () => ({
  HOLD_STATE_MAP: {
    kilter: {
      42: { name: 'STARTING', color: '#00FF00', displayColor: '#00FF00' },
      43: { name: 'HAND', color: '#00FFFF', displayColor: '#00FFFF' },
      44: { name: 'FINISH', color: '#FF00FF', displayColor: '#FF00FF' },
      45: { name: 'FOOT', color: '#FFA500', displayColor: '#FFA500' },
    },
    tension: {
      1: { name: 'STARTING', color: '#00FF00', displayColor: '#00FF00' },
      2: { name: 'HAND', color: '#00FFFF', displayColor: '#00FFFF' },
      3: { name: 'FINISH', color: '#FF00FF', displayColor: '#FF00FF' },
      4: { name: 'FOOT', color: '#FFA500', displayColor: '#FFA500' },
    },
    moonboard: {
      1: { name: 'STARTING', color: '#00FF00', displayColor: '#00FF00' },
      2: { name: 'HAND', color: '#00FFFF', displayColor: '#00FFFF' },
      3: { name: 'FINISH', color: '#FF00FF', displayColor: '#FF00FF' },
    },
  },
  STATE_TO_PRIMARY_CODE: {
    kilter: { STARTING: 42, HAND: 43, FINISH: 44, FOOT: 45 },
    tension: { STARTING: 1, HAND: 2, FINISH: 3, FOOT: 4 },
    moonboard: { STARTING: 42, HAND: 43, FINISH: 44 },
  },
}));

describe('useCreateClimb', () => {
  describe('initial state', () => {
    it('has empty holdsMap', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      expect(result.current.litUpHoldsMap).toEqual({});
      expect(result.current.totalHolds).toBe(0);
      expect(result.current.startingCount).toBe(0);
      expect(result.current.finishCount).toBe(0);
      expect(result.current.isValid).toBe(false);
    });
  });

  describe('setHoldState', () => {
    it('sets a hold to STARTING', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });

      expect(result.current.litUpHoldsMap[100]).toEqual({
        state: 'STARTING',
        color: '#00FF00',
        displayColor: '#00FF00',
      });
    });

    it('sets a hold to HAND', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'HAND');
      });

      expect(result.current.litUpHoldsMap[100].state).toBe('HAND');
      expect(result.current.litUpHoldsMap[100].color).toBe('#00FFFF');
    });

    it('sets a hold to FOOT', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'FOOT');
      });

      expect(result.current.litUpHoldsMap[100].state).toBe('FOOT');
      expect(result.current.litUpHoldsMap[100].color).toBe('#FFA500');
    });

    it('sets a hold to FINISH', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'FINISH');
      });

      expect(result.current.litUpHoldsMap[100].state).toBe('FINISH');
      expect(result.current.litUpHoldsMap[100].color).toBe('#FF00FF');
    });

    it('changes a hold from one state to another', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(100, 'FOOT');
      });

      expect(result.current.litUpHoldsMap[100].state).toBe('FOOT');
    });

    it('OFF removes the hold from the map', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      expect(result.current.totalHolds).toBe(1);

      act(() => {
        result.current.setHoldState(100, 'OFF');
      });

      expect(result.current.litUpHoldsMap[100]).toBeUndefined();
      expect(result.current.totalHolds).toBe(0);
    });
  });

  describe('max state limits', () => {
    it('refuses to add a third STARTING hold when 2 already exist', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(200, 'STARTING');
      });
      expect(result.current.startingCount).toBe(2);

      act(() => {
        result.current.setHoldState(300, 'STARTING');
      });

      expect(result.current.litUpHoldsMap[300]).toBeUndefined();
      expect(result.current.startingCount).toBe(2);
    });

    it('refuses to add a third FINISH hold when 2 already exist', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'FINISH');
      });
      act(() => {
        result.current.setHoldState(200, 'FINISH');
      });
      expect(result.current.finishCount).toBe(2);

      act(() => {
        result.current.setHoldState(300, 'FINISH');
      });

      expect(result.current.litUpHoldsMap[300]).toBeUndefined();
    });

    it('allows re-selecting the same state on a hold already at the limit', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(200, 'STARTING');
      });
      // Re-set hold 100 to STARTING — should not no-op since it's already there.
      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });

      expect(result.current.litUpHoldsMap[100].state).toBe('STARTING');
      expect(result.current.startingCount).toBe(2);
    });
  });

  describe('generateFramesString', () => {
    it('produces correct format for kilter holds', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });

      const frames = result.current.generateFramesString();
      expect(frames).toBe('p100r42');
    });

    it('produces correct format for multiple holds', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(200, 'HAND');
      });

      const frames = result.current.generateFramesString();
      expect(frames).toContain('p100r42');
      expect(frames).toContain('p200r43');
    });

    it('returns empty string when no holds', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      const frames = result.current.generateFramesString();
      expect(frames).toBe('');
    });
  });

  describe('resetHolds', () => {
    it('clears all holds', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(200, 'HAND');
      });
      expect(result.current.totalHolds).toBe(2);

      act(() => {
        result.current.resetHolds();
      });

      expect(result.current.litUpHoldsMap).toEqual({});
      expect(result.current.totalHolds).toBe(0);
      expect(result.current.startingCount).toBe(0);
      expect(result.current.finishCount).toBe(0);
      expect(result.current.isValid).toBe(false);
    });
  });

  describe('derived counts', () => {
    it('totalHolds counts correctly', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(200, 'HAND');
      });
      act(() => {
        result.current.setHoldState(300, 'FOOT');
      });

      expect(result.current.totalHolds).toBe(3);
    });

    it('startingCount is correct', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });
      act(() => {
        result.current.setHoldState(200, 'STARTING');
      });

      expect(result.current.startingCount).toBe(2);
    });

    it('finishCount is correct', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'FINISH');
      });

      expect(result.current.finishCount).toBe(1);
    });

    it('isValid is true when holds > 0', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      expect(result.current.isValid).toBe(false);

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });

      expect(result.current.isValid).toBe(true);
    });
  });

  describe('initial holds map', () => {
    it('works with initial holds map', () => {
      const initialHoldsMap = {
        100: { state: 'STARTING' as const, color: '#00FF00', displayColor: '#00FF00' },
        200: { state: 'HAND' as const, color: '#00FFFF', displayColor: '#00FFFF' },
      };

      const { result } = renderHook(() => useCreateClimb('kilter', { initialHoldsMap }));

      expect(result.current.litUpHoldsMap).toEqual(initialHoldsMap);
      expect(result.current.totalHolds).toBe(2);
      expect(result.current.startingCount).toBe(1);
      expect(result.current.isValid).toBe(true);
    });
  });

  describe('loadHolds', () => {
    it('replaces the entire holds map', () => {
      const { result } = renderHook(() => useCreateClimb('kilter'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });

      const next = {
        200: { state: 'HAND' as const, color: '#00FFFF', displayColor: '#00FFFF' },
        300: { state: 'FINISH' as const, color: '#FF00FF', displayColor: '#FF00FF' },
      };
      act(() => {
        result.current.loadHolds(next);
      });

      expect(result.current.litUpHoldsMap).toEqual(next);
      expect(result.current.litUpHoldsMap[100]).toBeUndefined();
    });
  });

  describe('tension board', () => {
    it('uses tension state codes', () => {
      const { result } = renderHook(() => useCreateClimb('tension'));

      act(() => {
        result.current.setHoldState(100, 'STARTING');
      });

      const frames = result.current.generateFramesString();
      expect(frames).toBe('p100r1');
    });
  });
});
