import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators';
import { PrismaService } from '../prisma/prisma.module';

/** Active Admin / Sales users, for "filter by salesperson" (the full users list is Admin-only). */
@Controller('owners')
export class OwnersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('dashboard.company')
  async list(): Promise<{ items: { id: string; name: string }[] }> {
    const items = await this.prisma.user.findMany({
      where: { active: true, role: 'SALES' }, // D-021: project managers own projects; the Admin sees none
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { items };
  }
}
