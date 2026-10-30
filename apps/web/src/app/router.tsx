import { type Permission } from '@salescrm/auth/permissions';
import { type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AcceptInvitePage } from '../features/auth/AcceptInvitePage';
import { AuditLogPage } from '../features/audit/AuditLogPage';
import { LoginPage } from '../features/auth/LoginPage';
import { BillingPage } from '../features/billing/BillingPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { InvoicesPage } from '../features/invoices/InvoicesPage';
import { ClientDetailPage } from '../features/clients/ClientDetailPage';
import { ClientsListPage } from '../features/clients/ClientsListPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { ProjectFormPage } from '../features/projects/ProjectFormPage';
import { ProjectsListPage } from '../features/projects/ProjectsListPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AppLayout } from './AppLayout';
import { ComparePage } from '../features/dashboard/ComparePage';
import { ProfilePage } from '../features/settings/ProfilePage';
import { UsersPage } from '../features/settings/UsersPage';
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
      { index: true, element: guarded('dashboard.own', <DashboardPage />) },
      { path: 'users', element: guarded('users.manage', <UsersPage />) },
      { path: 'compare', element: guarded('dashboard.company', <ComparePage />) },
      { path: 'invoices', element: guarded('invoices.read', <InvoicesPage />) },
      { path: 'projects', element: guarded('projects.read', <ProjectsListPage />) },
      { path: 'projects/new', element: guarded('projects.write', <ProjectFormPage />) },
      { path: 'projects/:id', element: guarded('projects.read', <ProjectDetailPage />) },
      { path: 'projects/:id/edit', element: guarded('projects.write', <ProjectFormPage />) },
      { path: 'billing', element: guarded('billing.read', <BillingPage />) },
      { path: 'clients', element: guarded('clients.read', <ClientsListPage />) },
      { path: 'clients/:id', element: guarded('clients.read', <ClientDetailPage />) },
      { path: 'settings', element: guarded('settings.company', <SettingsPage />) },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'audit', element: guarded('audit.read', <AuditLogPage />) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
