import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

export const MIN_RENT_DAYS = 5;

export interface PeriodInput {
  from: string;
  to: string;
  startTime: string;
  endTime: string;
}

/** Same rule as Carvi: `to − from + 1`, hours ignored. */
export function calendarDaysInclusive(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
}

export function meetsMinRentDays(from: string, to: string): boolean {
  return calendarDaysInclusive(from, to) >= MIN_RENT_DAYS;
}

export const isoDate = (date: Date): string => format(date, 'yyyy-MM-dd');

/** A week from today, exactly five calendar days, 10:00 → 10:00. */
export function defaultPeriod(): PeriodInput {
  const from = addDays(new Date(), 7);
  return { from: isoDate(from), to: isoDate(addDays(from, MIN_RENT_DAYS - 1)), startTime: '10:00', endTime: '10:00' };
}

export const fmtDate = (iso: string): string => format(parseISO(iso), 'dd/MM/yyyy');
export const fmtDateTime = (iso: string): string => format(new Date(iso), 'dd/MM/yyyy HH:mm:ss');
export const fmtTime = (iso: string): string => format(new Date(iso), 'HH:mm:ss');
