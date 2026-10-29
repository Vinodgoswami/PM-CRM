import { type Permission } from '@salescrm/auth/permissions';
import { type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AcceptInvitePage } from '../features/auth/AcceptInvitePage';
import { AuditLogPage } from '../features/audit/AuditLogPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ClientDetailPage } from '../features/clients/ClientDetailPage';
import { ClientsListPage } from '../features/clients/ClientsListPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { ProjectFormPage } from '../features/projects/ProjectFormPage';
import { ProjectsListPage } from '../features/projects/ProjectsListPage';
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
      { path: 'projects', element: guarded('projects.read', <ProjectsListPage />) },
      { path: 'projects/new', element: guarded('projects.write', <ProjectFormPage />) },
      { path: 'projects/:id', element: guarded('projects.read', <ProjectDetailPage />) },
      { path: 'projects/:id/edit', element: guarded('projects.write', <ProjectFormPage />) },
      { path: 'billing', element: guarded('billing.read', <PlaceholderPage title="Completed Billing" phase={3} />) },
      { path: 'clients', element: guarded('clients.read', <ClientsListPage />) },
      { path: 'clients/:id', element: guarded('clients.read', <ClientDetailPage />) },
      { path: 'settings', element: guarded('settings.manage', <SettingsPage />) },
      { path: 'audit', element: guarded('audit.read', <AuditLogPage />) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
