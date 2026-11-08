import '@fontsource-variable/manrope';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createAppRouter } from './app/router';
import { getQueryClient } from './lib/query-client';
import { ConfirmProvider } from './components/ConfirmDialog';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={getQueryClient()}>
      <ConfirmProvider>
        <RouterProvider router={createAppRouter()} />
      </ConfirmProvider>
    </QueryClientProvider>
  </StrictMode>,
);
