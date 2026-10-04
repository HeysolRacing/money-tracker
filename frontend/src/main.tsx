import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/plus-jakarta-sans';

import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { notifications, Notifications } from '@mantine/notifications';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/es-mx';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import { DesignProvider } from './theme/DesignProvider';

dayjs.locale('es-mx');

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  // Every failed mutation shows the backend's (Spanish) error message.
  mutationCache: new MutationCache({
    onError: (error) =>
      notifications.show({ color: 'red', title: 'No se pudo guardar', message: error.message }),
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignProvider>
      <DatesProvider settings={{ locale: 'es-mx', firstDayOfWeek: 1 }}>
        <Notifications />
        <QueryClientProvider client={queryClient}>
          <ModalsProvider>
            <RouterProvider router={router} />
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </DesignProvider>
  </StrictMode>,
);
