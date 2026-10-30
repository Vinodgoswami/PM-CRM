import { STATUS_NAME } from '@salescrm/core';
import { type ProjectStatusValue } from '@salescrm/schemas';
import { type Role } from '@salescrm/types';

/**
 * On-screen words (D-017). The product serves project managers who report to the CEO, so nothing on screen uses
 * sales vocabulary. Stored values (SALES, WON, upsell, booked…) keep their names in the code, database and API.
 */
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', SALES: 'Project Manager', CEO: 'CEO' };

export const STATUS_LABEL: Record<ProjectStatusValue, string> = STATUS_NAME;

/** Whoever owns a project (role SALES or ADMIN). */
export const OWNER = 'Project manager';
