import { addDays, endOfMonth, getDay, parseISO } from 'date-fns';
import type { UnavailabilityItem, UnavailabilityReason } from '../api/types';
import { isoDate } from './dates';

/** Anything that can answer whether a YYYY-MM-DD day is taken (the map below, or a plain Set). */
export interface DayLookup { has(day: string): boolean }

/** Every local day covered by any item (inclusive), with its reason; BOOKED wins when both overlap. */
export function unavailableDaySet(items: UnavailabilityItem[]): Map<string, UnavailabilityReason> {
  const days = new Map<string, UnavailabilityReason>();
  for (const item of items) {
    const last = parseISO(item.to);
    for (let d = parseISO(item.from); d <= last; d = addDays(d, 1)) {
      const key = isoDate(d);
      if (days.get(key) !== 'BOOKED') days.set(key, item.reason);
    }
  }
  return days;
}

export interface CalendarDay { date: string; day: number }
/** A Monday-first week; `null` pads the days that belong to the previous or next month. */
export type CalendarWeek = Array<CalendarDay | null>;

/** Weeks of the month (`month` is 1-12), each with 7 slots starting on Monday. */
export function monthGrid(year: number, month: number): CalendarWeek[] {
  const first = new Date(year, month - 1, 1);
  const lastDay = endOfMonth(first).getDate();
  const lead = (getDay(first) + 6) % 7; // Monday = 0
  const cells: Array<CalendarDay | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= lastDay; day++) cells.push({ date: isoDate(new Date(year, month - 1, day)), day });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** True when no day between `from` and `to` (inclusive, any order) is unavailable. */
export function rangeIsFree(from: string, to: string, unavailableDays: DayLookup): boolean {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const last = parseISO(end);
  for (let d = parseISO(start); d <= last; d = addDays(d, 1)) {
    if (unavailableDays.has(isoDate(d))) return false;
  }
  return true;
}

/** First window of `days` consecutive free days starting at or after `startFrom`, looking `horizonDays` ahead. */
export function firstFreeRange(startFrom: string, days: number, unavailableDays: DayLookup, horizonDays: number): { from: string; to: string } | null {
  if (days < 1) return null;
  const start = parseISO(startFrom);
  let run = 0;
  for (let offset = 0; offset < horizonDays; offset++) {
    const day = isoDate(addDays(start, offset));
    run = unavailableDays.has(day) ? 0 : run + 1;
    if (run === days) return { from: isoDate(addDays(start, offset - days + 1)), to: day };
  }
  return null;
}
