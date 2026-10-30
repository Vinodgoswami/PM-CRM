import { motion } from 'motion/react';
import { type ReactNode } from 'react';

/** Dashboard card: titled, optional corner action, fades in. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      aria-label={title}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
      className={`min-w-0 rounded-xl bg-surface p-5 shadow-card ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </motion.section>
  );
}
