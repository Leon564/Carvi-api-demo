import { describe, expect, it } from 'vitest';
import { calendarDaysInclusive, meetsMinRentDays } from './dates';

describe('calendarDaysInclusive', () => {
  it('counts both ends as full days, ignoring hours', () => {
    expect(calendarDaysInclusive('2026-10-10', '2026-10-14')).toBe(5);
    expect(calendarDaysInclusive('2026-10-10', '2026-10-13')).toBe(4);
    expect(calendarDaysInclusive('2026-10-10', '2026-10-10')).toBe(1);
  });
  it('applies the 5-day minimum', () => {
    expect(meetsMinRentDays('2026-10-10', '2026-10-14')).toBe(true);
    expect(meetsMinRentDays('2026-10-10', '2026-10-13')).toBe(false);
  });
});
