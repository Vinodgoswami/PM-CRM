import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Toaster } from '@salescrm/ui';
import { LogOut, Menu, X } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useSession } from '../features/auth/api';
import { type NavItem, visibleNav } from './nav';

const ROLE_LABEL = { ADMIN: 'Admin', SALES: 'Sales', CEO: 'CEO' } as const;
/** Settings and the audit log live as icon buttons on the right, like the reference; the rest are pill tabs. */
const UTILITY = new Set(['/settings', '/audit']);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function AppLayout() {
  const { data } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!data) return null;
  const { user } = data;
  const items = visibleNav(user);
  const primary = items.filter((i) => !UTILITY.has(i.path));
  const utility = items.filter((i) => UTILITY.has(i.path));

  const pill = ({ label, path, icon: Icon }: NavItem) => (
    <NavLink
      key={path}
      to={path}
      end={path === '/'}
      onClick={() => setMenuOpen(false)}
      className={({ isActive }) =>
        `relative flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
          isActive ? 'font-semibold text-text' : 'text-text-muted hover:text-text'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-pill"
              className="absolute inset-0 rounded-full bg-surface shadow-card"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            />
          )}
          <Icon aria-hidden className="relative size-4 md:hidden" />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col px-3 pb-8 sm:px-5">
        <header className="sticky top-3 z-30 mt-3 flex items-center gap-3 rounded-xl bg-surface/90 px-3 py-2.5 shadow-card backdrop-blur sm:px-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2 pr-2">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-contrast">S</span>
            <span className="text-base font-bold tracking-tight">SalesCRM</span>
          </NavLink>

          <nav aria-label="Main" className="mx-auto hidden items-center gap-1 rounded-full bg-background p-1 lg:flex">
            {primary.map(pill)}
            {utility.length > 0 && <span className="sr-only">{utility.map((u) => u.label).join(', ')}</span>}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            {utility.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                aria-label={label}
                title={label}
                className={({ isActive }) =>
                  `hidden size-10 place-items-center rounded-full border border-border transition-colors lg:grid ${isActive ? 'bg-primary text-primary-contrast' : 'hover:bg-accent'}`
                }
              >
                <Icon className="size-4" aria-hidden />
              </NavLink>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-accent">
                  <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-bold text-primary">
                    {initials(user.name)}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block truncate text-sm font-semibold">{user.name}</span>
                    <span className="block text-xs text-text-muted">{ROLE_LABEL[user.role]}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </header>

        {menuOpen && (
          <nav aria-label="Main" className="mt-2 flex flex-col gap-1 rounded-xl bg-surface p-2 shadow-card lg:hidden">
            {items.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-accent font-semibold text-primary' : 'text-text-muted'}`
                }
              >
                <Icon aria-hidden className="size-4" /> {label}
              </NavLink>
            ))}
          </nav>
        )}

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className="flex-1 pt-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
      <Toaster />
    </MotionConfig>
  );
}
