import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Toaster } from '@salescrm/ui';
import { LogOut, Menu } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useSession } from '../features/auth/api';
import { visibleNav } from './nav';

const ROLE_LABEL = { ADMIN: 'Admin', SALES: 'Sales', CEO: 'CEO' } as const;

export function AppLayout() {
  const { data } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!data) return null;
  const { user } = data;

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {visibleNav(user).map(({ label, path, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${isActive ? 'bg-accent font-medium text-primary' : 'text-text-muted hover:bg-accent hover:text-text'}`
          }
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
          <p className="px-6 py-5 text-lg font-semibold">SalesCRM</p>
          {nav}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMenuOpen((o) => !o)}>
              <Menu className="size-5" />
            </Button>
            <span className="md:hidden font-semibold">SalesCRM</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="ml-auto">
                  <span className="truncate">{user.name}</span>
                  <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs text-primary">{ROLE_LABEL[user.role]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {menuOpen && <div className="border-b border-border bg-surface md:hidden">{nav}</div>}
          <AnimatePresence mode="wait">
            <motion.main
              key={location.pathname}
              className="flex-1 p-4 md:p-8"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              <Outlet />
            </motion.main>
          </AnimatePresence>
        </div>
      </div>
      <Toaster />
    </MotionConfig>
  );
}
