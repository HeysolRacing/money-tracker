import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAuth } from './features/auth/RequireAuth';
import { AccountsPage } from './pages/AccountsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TransactionsPage } from './pages/TransactionsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/movimientos', element: <TransactionsPage /> },
      { path: '/facturas', element: <InvoicesPage /> },
      { path: '/cuentas', element: <AccountsPage /> },
      { path: '/categorias', element: <CategoriesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
