import { describe, expect, it } from 'vitest';
import { canStillPay, isTerminalPayError, needsRequote } from './guidance';

const expiresAt = '2026-09-30T10:00:00.000Z';
const at = (iso: string) => new Date(iso).getTime();

describe('canStillPay', () => {
  it('allows paying a HOLD until the 2-minute grace window after expiry ends', () => {
    const hold = { status: 'HOLD' as const, hold: { expiresAt } };
    expect(canStillPay(hold, at('2026-09-30T09:59:00.000Z'))).toBe(true);
    expect(canStillPay(hold, at('2026-09-30T10:02:00.000Z'))).toBe(true);
    expect(canStillPay(hold, at('2026-09-30T10:02:01.000Z'))).toBe(false);
  });

  it('never allows paying a booking that is not in HOLD or has no hold', () => {
    expect(canStillPay({ status: 'CONFIRMED', hold: { expiresAt } }, at('2026-09-30T09:00:00.000Z'))).toBe(false);
    expect(canStillPay({ status: 'EXPIRED', hold: null })).toBe(false);
    expect(canStillPay({ status: 'HOLD', hold: null })).toBe(false);
  });
});

describe('error classification', () => {
  it('treats HOLD_EXPIRED as terminal and quote errors as requote', () => {
    expect(isTerminalPayError('HOLD_EXPIRED')).toBe(true);
    expect(isTerminalPayError('VEHICLE_NOT_AVAILABLE')).toBe(false);
    expect(needsRequote('QUOTE_EXPIRED')).toBe(true);
    expect(needsRequote('HOLD_EXPIRED')).toBe(false);
  });
});
