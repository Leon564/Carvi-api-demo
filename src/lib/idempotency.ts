/** One key per logical operation; reuse it to repeat the same request. */
export const newIdempotencyKey = (): string => crypto.randomUUID();

export const newExternalPaymentId = (): string => `demo_pay_${crypto.randomUUID().slice(0, 8)}`;
