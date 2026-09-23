import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CarviApiError } from './client';
import * as api from './requests';
import type { AvailabilityParams, Booking, BookingInput, BookingsFilter, CancelResult, PaymentInput, Quote, QuoteInput } from './types';

export const useServerConfig = () => useQuery({ queryKey: ['config'], queryFn: api.getServerConfig, staleTime: Infinity });
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.getHealth, retry: false });
export const useVehicles = (page: number, limit = 12) =>
  useQuery({ queryKey: ['vehicles', page, limit], queryFn: () => api.listVehicles(page, limit), placeholderData: keepPreviousData });
export const useVehicle = (id?: string) => useQuery({ queryKey: ['vehicle', id], queryFn: () => api.getVehicle(id as string), enabled: !!id });
export const useAvailability = (params: AvailabilityParams | null) =>
  useQuery({
    queryKey: ['availability', params],
    queryFn: () => api.getAvailability(params as AvailabilityParams),
    enabled: !!params && params.vehicleIds.length > 0,
    staleTime: 0,
    retry: false,
  });
export const useCreateQuote = () => useMutation<Quote, CarviApiError, QuoteInput>({ mutationFn: api.createQuote });
export const useBookings = (filter: BookingsFilter) =>
  useQuery({ queryKey: ['bookings', filter], queryFn: () => api.listBookings(filter), placeholderData: keepPreviousData });
export const useBooking = (id?: string) => useQuery({ queryKey: ['booking', id], queryFn: () => api.getBooking(id as string), enabled: !!id });

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, CarviApiError, { input: BookingInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => api.createBooking(input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
export function useConfirmBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, CarviApiError, { id: string; payment: PaymentInput; idempotencyKey: string }>({
    mutationFn: ({ id, payment, idempotencyKey }) => api.confirmBooking(id, payment, idempotencyKey),
    onSuccess: (booking) => {
      queryClient.setQueryData(['booking', booking.id], booking);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation<CancelResult, CarviApiError, { id: string; reason?: string; idempotencyKey: string }>({
    mutationFn: ({ id, reason, idempotencyKey }) => api.cancelBooking(id, reason, idempotencyKey),
    onSuccess: (result) => {
      queryClient.setQueryData(['booking', result.booking.id], result.booking);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
