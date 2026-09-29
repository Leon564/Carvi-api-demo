import { describe, expect, it } from 'vitest';
import type { UnavailabilityItem } from '../api/types';
import { firstFreeRange, monthGrid, rangeIsFree, unavailableDaySet } from './calendar';

const item = (from: string, to: string, reason: UnavailabilityItem['reason']): UnavailabilityItem => ({
  from, to, startsAt: `${from}T10:00:00.000Z`, endsAt: `${to}T22:00:00.000Z`, reason,
});

describe('unavailableDaySet', () => {
  it('expands each item to every day, both ends included', () => {
    const days = unavailableDaySet([item('2026-10-05', '2026-10-07', 'BOOKED'), item('2026-10-31', '2026-11-01', 'BLOCKED')]);
    expect([...days.keys()]).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-31', '2026-11-01']);
    expect(days.get('2026-11-01')).toBe('BLOCKED');
  });
  it('lets BOOKED win on overlapping days, whatever the order', () => {
    const a = unavailableDaySet([item('2026-10-05', '2026-10-07', 'BOOKED'), item('2026-10-06', '2026-10-08', 'BLOCKED')]);
    const b = unavailableDaySet([item('2026-10-06', '2026-10-08', 'BLOCKED'), item('2026-10-05', '2026-10-07', 'BOOKED')]);
    for (const days of [a, b]) {
      expect(days.get('2026-10-06')).toBe('BOOKED');
      expect(days.get('2026-10-07')).toBe('BOOKED');
      expect(days.get('2026-10-08')).toBe('BLOCKED');
    }
  });
  it('returns an empty map without items', () => {
    expect(unavailableDaySet([]).size).toBe(0);
  });
});

describe('monthGrid', () => {
  it('starts weeks on Monday and pads with nulls', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const weeks = monthGrid(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]).toEqual({ date: '2026-10-01', day: 1 });
    expect(weeks[4][5]).toEqual({ date: '2026-10-31', day: 31 });
    expect(weeks[4][6]).toBeNull();
  });
  it('handles a month that starts on Monday and leap years', () => {
    const june = monthGrid(2026, 6); // 1 June 2026 is a Monday
    expect(june[0][0]).toEqual({ date: '2026-06-01', day: 1 });
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
  });
});

describe('rangeIsFree', () => {
  const days = unavailableDaySet([item('2026-10-10', '2026-10-12', 'BOOKED')]);
  it('rejects a range that crosses an unavailable day', () => {
    expect(rangeIsFree('2026-10-08', '2026-10-10', days)).toBe(false);
    expect(rangeIsFree('2026-10-01', '2026-10-20', days)).toBe(false);
  });
  it('accepts free ranges, in either order, and works with a Set', () => {
    expect(rangeIsFree('2026-10-13', '2026-10-17', days)).toBe(true);
    expect(rangeIsFree('2026-10-09', '2026-10-05', days)).toBe(true);
    expect(rangeIsFree('2026-10-05', '2026-10-05', new Set(['2026-10-05']))).toBe(false);
  });
});

describe('firstFreeRange', () => {
  const days = unavailableDaySet([item('2026-10-03', '2026-10-04', 'BOOKED'), item('2026-10-08', '2026-10-08', 'BLOCKED')]);
  it('returns the first run of consecutive free days', () => {
    expect(firstFreeRange('2026-10-01', 2, days, 30)).toEqual({ from: '2026-10-01', to: '2026-10-02' });
    expect(firstFreeRange('2026-10-01', 3, days, 30)).toEqual({ from: '2026-10-05', to: '2026-10-07' });
    expect(firstFreeRange('2026-10-01', 5, days, 30)).toEqual({ from: '2026-10-09', to: '2026-10-13' });
  });
  it('returns null when nothing fits within the horizon', () => {
    expect(firstFreeRange('2026-10-01', 5, days, 10)).toBeNull();
    expect(firstFreeRange('2026-10-01', 0, days, 10)).toBeNull();
  });
  it('crosses month boundaries', () => {
    expect(firstFreeRange('2026-10-29', 5, new Set<string>(), 10)).toEqual({ from: '2026-10-29', to: '2026-11-02' });
  });
});
