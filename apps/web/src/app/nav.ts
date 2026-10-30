import { can, type Permission } from '@salescrm/auth/permissions';
import { type Role } from '@salescrm/types';
import { BadgeIndianRupee, Building2, FileClock, FolderKanban, LayoutDashboard, ScrollText, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  permission: Permission;
  icon: LucideIcon;
}

// Order and visibility follow docs/08-screens-and-flows.md § Navigation by role.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', permission: 'dashboard.own', icon: LayoutDashboard },
  { label: 'Upcoming Invoices', path: '/invoices', permission: 'invoices.read', icon: FileClock },
  { label: 'Projects', path: '/projects', permission: 'projects.read', icon: FolderKanban },
  { label: 'Completed Billing', path: '/billing', permission: 'billing.read', icon: BadgeIndianRupee },
  { label: 'Clients', path: '/clients', permission: 'clients.read', icon: Building2 },
  { label: 'Settings', path: '/settings', permission: 'users.manage', icon: Settings },
  { label: 'Audit log', path: '/audit', permission: 'audit.read', icon: ScrollText },
];

export function visibleNav(user: { id: string; role: Role }): NavItem[] {
  return NAV_ITEMS.filter((item) => can(user, item.permission));
}
