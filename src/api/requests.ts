import { carvi, local } from './client';
import type {
  AvailabilityParams, AvailabilityResponse, Booking, BookingInput, BookingsFilter, CancelResult, HealthResponse, Paged, PaymentInput, Quote, QuoteInput, ReceivedEvent, ServerConfig, UnavailabilityResponse, Vehicle,
} from './types';

export const getServerConfig = async () => (await local.get<ServerConfig>('/config')).data;
export const listReceivedEvents = async () => (await local.get<ReceivedEvent[]>('/events')).data;
export const getHealth = async () => (await carvi.get<HealthResponse>('/health')).data;
export const listVehicles = async (page: number, limit: number) => (await carvi.get<Paged<Vehicle>>('/vehicles', { params: { page, limit } })).data;
export const getVehicle = async (id: string) => (await carvi.get<Vehicle>(`/vehicles/${id}`)).data;
export const getAvailability = async (params: AvailabilityParams) =>
  (await carvi.get<AvailabilityResponse>('/availability', { params: { ...params, vehicleIds: params.vehicleIds.join(',') } })).data;
export const getUnavailability = async (vehicleId: string, from?: string, to?: string) => {
  const params = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  return (await carvi.get<UnavailabilityResponse>(`/vehicles/${vehicleId}/unavailability`, { params })).data;
};
export const createQuote = async (input: QuoteInput) => (await carvi.post<Quote>('/quotes', input)).data;
export const createBooking = async (input: BookingInput, idempotencyKey: string) =>
  (await carvi.post<Booking>('/bookings', input, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
export const listBookings = async (filter: BookingsFilter) => {
  const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== ''));
  return (await carvi.get<Paged<Booking>>('/bookings', { params })).data;
};
export const getBooking = async (id: string) => (await carvi.get<Booking>(`/bookings/${id}`)).data;
export const confirmBooking = async (id: string, payment: PaymentInput, idempotencyKey: string) =>
  (await carvi.post<Booking>(`/bookings/${id}/confirm`, { payment }, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
export const cancelBooking = async (id: string, reason: string | undefined, idempotencyKey: string) =>
  (await carvi.post<CancelResult>(`/bookings/${id}/cancel`, reason ? { reason } : {}, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
