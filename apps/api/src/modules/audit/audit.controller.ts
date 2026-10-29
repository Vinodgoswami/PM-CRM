import { Controller, Get, Query } from '@nestjs/common';
import { paginationQuerySchema } from '@salescrm/schemas';
import { z } from 'zod';
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
  list(@Query(new ZodValidationPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    return this.audit.list({ entity: q.entity, entityId: q.entityId }, q.page, q.pageSize);
  }
}
