/** The three fixed roles (docs/07). Values match the Prisma `Role` enum. */
export const ROLES = ['ADMIN', 'SALES', 'CEO'] as const;
export type Role = (typeof ROLES)[number];
