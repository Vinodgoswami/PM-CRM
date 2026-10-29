import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'salescrm:isPublic';

/** No session required (login, invite accept, password reset, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
