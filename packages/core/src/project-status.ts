import { type IsoDate } from './period';

export type ProjectStatus = 'LEAD' | 'PROPOSAL' | 'WON' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'LOST';

/** On-screen stage names (D-017); the stored codes keep their original names. */
export const STATUS_NAME: Record<ProjectStatus, string> = {
  LEAD: 'Enquiry',
  PROPOSAL: 'Quoted',
  WON: 'Confirmed',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  LOST: 'Cancelled',
};

/** docs/06 PS-1: the only moves a non-admin may make. */
export const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  LEAD: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['WON', 'LOST'],
  WON: ['ACTIVE', 'LOST'],
  ACTIVE: ['COMPLETED', 'ON_HOLD'],
  ON_HOLD: ['ACTIVE'],
  COMPLETED: [],
  LOST: [],
};

export type TransitionCheck = { ok: true } | { ok: false; rule: 'PS-1' | 'PS-4' | 'PS-6'; message: string };

export function checkTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  ctx: { isAdmin: boolean; milestones: { dueDate: IsoDate | null }[]; hasPayments: boolean },
): TransitionCheck {
  if (from === to) return { ok: false, rule: 'PS-1', message: `The project is already ${STATUS_NAME[to]}.` };
  // Admin may move any status (PS-1), but PS-4 and PS-6 protect data and apply to everyone.
  if (!ctx.isAdmin && !ALLOWED_TRANSITIONS[from].includes(to)) {
    return { ok: false, rule: 'PS-1', message: `A project cannot move from ${STATUS_NAME[from]} to ${STATUS_NAME[to]}.` };
  }
  if (to === 'ACTIVE' && (ctx.milestones.length === 0 || ctx.milestones.some((m) => !m.dueDate))) {
    return { ok: false, rule: 'PS-4', message: 'Add at least one milestone and give every milestone a due date first.' };
  }
  if (to === 'LOST' && ctx.hasPayments) {
    return { ok: false, rule: 'PS-6', message: 'This project has payments. Reverse them before cancelling it.' };
  }
  return { ok: true };
}

const BOOKED: ProjectStatus[] = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];
const CLOSED: ProjectStatus[] = ['COMPLETED', 'LOST'];

/** PS-2: wonAt is set once, the first time the project is booked; closedAt tracks COMPLETED / LOST. */
export function statusDates(
  _from: ProjectStatus,
  to: ProjectStatus,
  current: { wonAt: IsoDate | null; closedAt: IsoDate | null },
  today: IsoDate,
): { wonAt: IsoDate | null; closedAt: IsoDate | null } {
  return {
    wonAt: current.wonAt ?? (BOOKED.includes(to) ? today : null),
    closedAt: CLOSED.includes(to) ? today : null,
  };
}
