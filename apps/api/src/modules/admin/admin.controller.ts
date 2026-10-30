import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators';
import { PrismaService } from '../prisma/prisma.module';

/** D-021: the Admin's home — how much is in the system, with no names, clients or amounts. */
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @RequirePermission('admin.overview')
  async overview() {
    const [total, active, admins, ceos, projectManagers, clients, projects, payments, documents] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.user.count({ where: { role: 'ADMIN', active: true } }),
      this.prisma.user.count({ where: { role: 'CEO', active: true } }),
      this.prisma.user.count({ where: { role: 'SALES', active: true } }),
      this.prisma.client.count({ where: { archivedAt: null } }),
      this.prisma.project.count({ where: { archivedAt: null } }),
      this.prisma.payment.count(),
      this.prisma.document.count({ where: { status: 'READY' } }),
    ]);
    return { users: { total, active, admins, ceos, projectManagers }, clients, projects, payments, documents };
  }
}
