export type BookingStatus = 'HOLD' | 'EXPIRED' | 'CONFIRMED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export const BOOKING_STATUSES: BookingStatus[] = ['HOLD', 'EXPIRED', 'CONFIRMED', 'STARTED', 'COMPLETED', 'CANCELLED'];

export interface PageMeta { page: number; limit: number; total: number; totalPages: number }
export interface Paged<T> { data: T[]; meta: PageMeta }

export interface Host { id: string; displayName: string }

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  type: string;
  transmission: string;
  seats: number;
  airConditioning: boolean;
  consumption: number;
  rateDay: number;
  currency: string;
  images: { main: string; gallery: string[] };
  rating: { average: number; count: number };
  status: 'PUBLISHED';
  host: Host;
}

export interface AvailabilityParams { vehicleIds: string[]; from: string; to: string; startTime: string; endTime: string }
export interface AvailabilityRow { vehicleId: string; available: boolean; reason?: 'BOOKED' | 'BLOCKED' | 'NOT_FOUND'; rateDay?: number; currency?: string }
export interface AvailabilityResponse {
  data: AvailabilityRow[];
  meta: { from: string; to: string; startTime: string; endTime: string; timezone: string; gapHours: number };
}

export interface Period { from: string; to: string; startTime: string; endTime: string; timezone?: string }
export interface Pricing {
  rateDay: number; totalDays: number; totalHours: number; subtotal: number; advance: number; serviceFee: number; amountDue: number; total: number; currency: string;
}

export interface QuoteInput { vehicleId: string; from: string; to: string; startTime: string; endTime: string }
export interface Quote { quoteId: string; expiresAt: string; vehicle: { id: string; rateDay: number; currency: string }; period: Period; pricing: Pricing }

export interface Customer { fullName: string; email: string; phone: string; country: string }
export interface Place { location: string }
export interface BookingInput { quoteId: string; externalReference?: string; customer: Customer; pickup: Place; dropoff: Place }

export interface BookingVehicle {
  id: string; brand: string; model: string; year: number; type: string; transmission: string; seats: number; airConditioning: boolean; image?: string; host?: Host;
}
export interface BookingPayment { provider: string; externalPaymentId: string; amount: number; currency: string; status: string }
export interface BookingCancellation { reason: string | null; at: string | null; refundableAmount: number }

export interface Booking {
  id: string;
  confirmationCode: string;
  status: BookingStatus;
  channel: string;
  externalReference: string | null;
  vehicle: BookingVehicle;
  customer: Customer;
  period: Period;
  pickup: Place;
  dropoff: Place;
  pricing: Pricing;
  hold: { expiresAt: string } | null;
  payment: BookingPayment | null;
  cancellation: BookingCancellation | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentInput { externalPaymentId: string; amount: number; currency: 'USD' }
export interface CancelResult { booking: Booking; cancellation: { reason: string; refundableAmount: number; currency: string; policy: string } }

export interface BookingsFilter { page: number; limit: number; status?: BookingStatus; from?: string; to?: string }

export interface HealthResponse {
  status: string; time: string; environment: 'sandbox' | 'production'; database: 'up' | 'down'; credential: { clientId: string; scopes: string[] };
}
export interface ServerConfig { apiBaseUrl: string; clientId: string; webhookUrl: string; webhookSecretsConfigured: number }
export interface ErrorEnvelope { error: { code: string; message: string; details: unknown; requestId: string } }

export const PLACES = [
  { code: 'AIRPORT', label: 'Aeropuerto Internacional de San Salvador' },
  { code: 'SAN_SALVADOR', label: 'Ciudad de San Salvador' },
] as const;
export const placeLabel = (code: string): string => PLACES.find((p) => p.code === code)?.label ?? code;
