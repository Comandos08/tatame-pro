import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from '@/contexts/AppProviders';
import { AppRoutes } from '@/routes';

const App = () => (
  <BrowserRouter>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </BrowserRouter>
);

export default App;
