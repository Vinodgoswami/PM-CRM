import { Controller, Get, Query } from '@nestjs/common';
import { paginationQuerySchema } from '@salescrm/schemas';
import { z } from 'zod';
import { can } from '@salescrm/auth/permissions';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuditService } from './audit.service';

const auditQuerySchema = paginationQuerySchema.extend({
  entity: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
});

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    const accountsOnly = !can(user, 'audit.business');
    return this.audit.list({ entity: q.entity, entityId: q.entityId, accountsOnly }, q.page, q.pageSize);
  }
}
