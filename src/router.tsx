import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TechPanel } from './components/tech-panel/TechPanel';
import { BookingsPage } from './pages/BookingsPage';
import { HomePage } from './pages/HomePage';
import { VehiclePage } from './pages/VehiclePage';
import { VehiclesPage } from './pages/VehiclesPage';
import { WebhooksPage } from './pages/WebhooksPage';
import { BookingWizardPage } from './pages/wizard/BookingWizardPage';

export const router = createBrowserRouter([
  {
    element: <Layout techPanel={<TechPanel />} />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/vehiculos', element: <VehiclesPage /> },
      { path: '/vehiculos/:id', element: <VehiclePage /> },
      { path: '/reservar', element: <BookingWizardPage /> },
      { path: '/reservas', element: <BookingsPage /> },
      { path: '/webhooks', element: <WebhooksPage /> },
    ],
  },
]);
