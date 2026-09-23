/** Carvi could not be reached at all (DNS, refused connection, timeout). */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly requestId: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** `POST /auth/token` answered with an error status; `body` is Carvi's envelope. */
export class TokenError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Token request failed with status ${status}`);
    this.name = 'TokenError';
  }
}
