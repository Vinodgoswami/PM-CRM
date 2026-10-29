import { type Permission } from '@salescrm/auth/permissions';
import { type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AcceptInvitePage } from '../features/auth/AcceptInvitePage';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { AppLayout } from './AppLayout';
import { RequireAuth, RequirePermission } from './guards';

const guarded = (permission: Permission, element: ReactNode) => <RequirePermission permission={permission}>{element}</RequirePermission>;

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  { path: '/reset/:token', element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: guarded('dashboard.own', <PlaceholderPage title="Dashboard" phase={4} />) },
      { path: 'invoices', element: guarded('invoices.read', <PlaceholderPage title="Upcoming Invoices" phase={3} />) },
      { path: 'projects', element: guarded('projects.read', <PlaceholderPage title="Projects" phase={2} />) },
      { path: 'billing', element: guarded('billing.read', <PlaceholderPage title="Completed Billing" phase={3} />) },
      { path: 'clients', element: guarded('clients.read', <PlaceholderPage title="Clients" phase={2} />) },
      { path: 'settings', element: guarded('settings.manage', <PlaceholderPage title="Settings" phase={2} />) },
      { path: 'audit', element: guarded('audit.read', <PlaceholderPage title="Audit log" phase={2} />) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
