import { motion, MotionConfig } from 'motion/react';
import { APP_NAME } from '../../lib/brand';
import { type ReactNode } from 'react';

/** Hatched bars with one highlighted bar, echoing the dashboard chart style (decorative only). */
const BARS = [38, 62, 46, 88, 58, 72];

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-background">
      {/* Soft drifting green light. */}
      <motion.div
        className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[oklch(0.82_0.09_156)] opacity-50 blur-3xl"
        animate={{ x: [0, 60, -20, 0], y: [0, 40, 80, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-40 -bottom-48 size-[38rem] rounded-full bg-[oklch(0.88_0.07_150)] opacity-60 blur-3xl"
        animate={{ x: [0, -70, 10, 0], y: [0, -50, -10, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Faceted planes, a light take on the reference's shard background. */}
      <svg className="absolute inset-0 size-full opacity-[0.55]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1440 900">
        <defs>
          <linearGradient id="facet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <g fill="url(#facet)" stroke="oklch(0.86 0.02 156)" strokeWidth="1">
          <polygon points="0,0 380,0 210,240" />
          <polygon points="380,0 760,0 520,170" />
          <polygon points="1100,0 1440,0 1440,260 1240,140" />
          <polygon points="0,560 260,700 0,900" />
          <polygon points="1180,640 1440,520 1440,900 1300,900" />
          <polygon points="560,900 820,760 980,900" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,oklch(0.955_0.004_160/0.6))]" />
    </div>
  );
}

function WelcomePanel() {
  return (
    <div
      data-testid="welcome-panel"
      className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-contrast md:flex"
    >
      <div aria-hidden className="absolute -top-20 -right-20 size-72 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-24 -left-16 size-64 rounded-full bg-white/5" />
      <div className="relative space-y-4">
        <motion.h2
          className="text-4xl leading-tight font-extrabold"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          Welcome back!
        </motion.h2>
        <motion.p
          className="max-w-xs text-white/80"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          Every project, milestone and payment in one place — and the numbers your CEO asks for, ready.
        </motion.p>
      </div>
      <div aria-hidden className="relative flex h-36 items-end gap-3 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
        {BARS.map((h, i) => (
          <motion.div
            key={i}
            className={`flex-1 rounded-full ${i === 3 ? 'bg-white' : 'bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.55)_0_5px,transparent_5px_10px)]'}`}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: 0.35 + i * 0.08, duration: 0.7, ease: [0.2, 0, 0, 1] }}
          />
        ))}
      </div>
    </div>
  );
}

/** Shared shell for sign-in, invite acceptance and password reset. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
      <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
        <motion.div
          className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-white/70 bg-white/75 shadow-[0_30px_80px_-20px_oklch(0.3_0.05_156/0.35)] backdrop-blur-xl md:grid-cols-2"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        >
          <WelcomePanel />
          <div className="space-y-6 p-8 sm:p-10">
            <div className="flex items-center gap-2 md:hidden">
              <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-contrast">P</span>
              <span className="font-bold tracking-tight">{APP_NAME}</span>
            </div>
            <motion.div
              className="space-y-1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
              {description && <p className="text-sm text-text-muted">{description}</p>}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}>
              {children}
            </motion.div>
          </div>
        </motion.div>
      </main>
    </MotionConfig>
  );
}
