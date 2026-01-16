import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from '@/contexts/AppProviders';
import { AppRoutes } from '@/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
