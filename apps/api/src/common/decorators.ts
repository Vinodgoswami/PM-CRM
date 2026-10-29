import { SetMetadata } from '@nestjs/common';
import { type Permission } from '@salescrm/auth/permissions';

export const IS_PUBLIC = 'salescrm:isPublic';
export const IS_AUTHENTICATED = 'salescrm:isAuthenticated';
export const REQUIRED_PERMISSION = 'salescrm:permission';

/** No session required (login, invite accept, password reset, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Any signed-in user, whatever their role. */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED, true);

/** Role must have this permission (docs/07). Ownership is checked in the service for "own" scopes. */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);
