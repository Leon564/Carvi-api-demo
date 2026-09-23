/** The last request sent for a booking, kept so the user can resend it with the same idempotency key. */
export interface LastOperation {
  label: string;
  run: () => Promise<unknown>;
}
