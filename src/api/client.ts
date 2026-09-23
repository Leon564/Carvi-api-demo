import axios, { AxiosError } from 'axios';
import type { ErrorEnvelope } from './types';

export class CarviApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
    readonly requestId = '',
  ) {
    super(message);
    this.name = 'CarviApiError';
  }
}

/** Calls go to the local demo server, which adds the token and forwards to Carvi. */
export const carvi = axios.create({ baseURL: '/api/carvi', headers: { Accept: 'application/json' } });

carvi.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorEnvelope>) => {
    const envelope = error.response?.data?.error;
    if (envelope && error.response) {
      return Promise.reject(new CarviApiError(error.response.status, envelope.code, envelope.message, envelope.details, envelope.requestId));
    }
    return Promise.reject(new CarviApiError(error.response?.status ?? 0, 'NETWORK_ERROR', error.message));
  },
);

/** Local-only endpoints of the demo server (config, log, events). */
export const local = axios.create({ baseURL: '/api' });
