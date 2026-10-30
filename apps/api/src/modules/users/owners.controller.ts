import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { PrismaService } from '../prisma/prisma.module';

/** Active Admin / Sales users, for "filter by salesperson" (the full users list is Admin-only). */
@Controller('owners')
export class OwnersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('dashboard.company')
  async list(@CurrentUser() user: SessionUser): Promise<{ items: { id: string; name: string }[] }> {
    const items = await this.prisma.user.findMany({
      // D-021: project managers own projects. D-024: a CEO picks and filters by their own team only.
      where: { active: true, role: 'SALES', ...(user.role === 'CEO' ? { managerId: user.id } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { items };
  }
}
