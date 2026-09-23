import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TechPanel } from './components/tech-panel/TechPanel';
import { BookingsPage } from './pages/BookingsPage';
import { CatalogPage } from './pages/CatalogPage';
import { StatusPage } from './pages/StatusPage';
import { VehiclePage } from './pages/VehiclePage';
import { WebhooksPage } from './pages/WebhooksPage';
import { BookingWizardPage } from './pages/wizard/BookingWizardPage';

export const router = createBrowserRouter([
  {
    element: <Layout techPanel={<TechPanel />} />,
    children: [
      { path: '/', element: <StatusPage /> },
      { path: '/catalogo', element: <CatalogPage /> },
      { path: '/catalogo/:id', element: <VehiclePage /> },
      { path: '/reservar', element: <BookingWizardPage /> },
      { path: '/reservas', element: <BookingsPage /> },
      { path: '/webhooks', element: <WebhooksPage /> },
    ],
  },
]);
