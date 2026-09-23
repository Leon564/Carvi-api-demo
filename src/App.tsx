import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { CarviApiError } from './api/client';
import { TechPanelProvider } from './components/tech-panel/TechPanelContext';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx responses are the caller's fault and will not succeed on retry; only network errors
      // (status 0) and 5xx are worth one retry.
      retry: (failureCount, error) => !(error instanceof CarviApiError && error.status > 0 && error.status < 500) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TechPanelProvider>
        <RouterProvider router={router} />
      </TechPanelProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
