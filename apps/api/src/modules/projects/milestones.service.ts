import { Injectable } from '@nestjs/common';
import { changedFields } from '@salescrm/core';
import { type Prisma } from '@salescrm/database';
import { type MilestoneInput, type ProjectDetail, type UpdateMilestoneInput } from '@salescrm/schemas';
import { minorFromJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { AppError, notFound, RuleViolation } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';
import { isoDate } from './project-money';
import { ProjectsService } from './projects.service';

const toDate = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);
const paid = (m: { payments: { amountMinor: bigint }[] }) => m.payments.reduce((s, p) => s + p.amountMinor, 0n);

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  /** The milestone plus its project, with write access checked against the project owner. */
  private async loadForWrite(tx: Prisma.TransactionClient, user: SessionUser, milestoneId: string) {
    // Same lock as Mark-as-paid: MS-1 / MS-2 decisions must see payments that commit concurrently.
    await tx.$queryRaw`SELECT id FROM "Milestone" WHERE id = ${milestoneId} FOR UPDATE`;
    const milestone = await tx.milestone.findUnique({
      where: { id: milestoneId },
      include: { payments: { select: { amountMinor: true } } },
    });
    if (!milestone) throw notFound();
    const project = await this.projects.loadForWrite(milestone.projectId, user, tx);
    return { milestone, project };
  }

  /** MS-1: numbers stay 1..n. Shift out of the way first so the (projectId, number) unique index never collides. */
  private async renumber(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    for (const [i, id] of ids.entries()) await tx.milestone.update({ where: { id }, data: { number: 1000 + i } });
    for (const [i, id] of ids.entries()) await tx.milestone.update({ where: { id }, data: { number: i + 1 } });
  }

  async create(user: SessionUser, projectId: string, input: MilestoneInput): Promise<ProjectDetail> {
    await this.prisma.$transaction(async (tx) => {
      const project = await this.projects.loadForWrite(projectId, user, tx);
      if (project.status === 'ACTIVE' && !input.dueDate) {
        throw new RuleViolation('PS-4', 'Milestones of an active project need a due date.');
      }
      const created = await tx.milestone.create({
        data: {
          projectId,
          number: project.milestones.length + 1,
          title: input.title,
          invoiceId: input.invoiceId || null,
          description: input.description ?? null,
          amountMinor: minorFromJson(input.amountMinor),
          dueDate: toDate(input.dueDate),
          createdById: user.id,
        },
      });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'milestone.create',
        entity: 'Project',
        entityId: projectId,
        after: { milestoneId: created.id, number: created.number, title: created.title, amountMinor: created.amountMinor.toString() },
      });
      await this.projects.assertMilestonesWithinValue(tx, projectId);
    });
    return this.projects.get(projectId, user);
  }

  async update(user: SessionUser, milestoneId: string, input: UpdateMilestoneInput): Promise<ProjectDetail> {
    const projectId = await this.prisma.$transaction(async (tx) => {
      const { milestone, project } = await this.loadForWrite(tx, user, milestoneId);
      if (input.amountMinor !== undefined && minorFromJson(input.amountMinor) < paid(milestone)) {
        throw new RuleViolation('MS-2', 'The amount cannot be lower than what has already been paid on this milestone.');
      }
      if (input.dueDate === null && project.status === 'ACTIVE') {
        throw new RuleViolation('PS-4', 'Milestones of an active project need a due date.');
      }
      const after = await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.invoiceId !== undefined ? { invoiceId: input.invoiceId || null } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.amountMinor !== undefined ? { amountMinor: minorFromJson(input.amountMinor) } : {}),
          ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) } : {}),
        },
      });
      if (input.amountMinor !== undefined) await this.projects.assertMilestonesWithinValue(tx, project.id);
      const pick = (m: typeof after) => ({
        title: m.title,
        invoiceId: m.invoiceId,
        description: m.description,
        amountMinor: m.amountMinor,
        dueDate: isoDate(m.dueDate),
      });
      const diff = changedFields(pick(milestone), pick(after));
      if (diff) {
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'milestone.update',
          entity: 'Project',
          entityId: project.id,
          before: { milestoneId, ...diff.before },
          after: { milestoneId, ...diff.after },
        });
      }
      return project.id;
    });
    return this.projects.get(projectId, user);
  }

  async remove(user: SessionUser, milestoneId: string): Promise<ProjectDetail> {
    const projectId = await this.prisma.$transaction(async (tx) => {
      const { milestone, project } = await this.loadForWrite(tx, user, milestoneId);
      if (milestone.payments.length > 0) throw new RuleViolation('MS-1', 'This milestone has payments and cannot be deleted.');
      await tx.milestone.delete({ where: { id: milestoneId } });
      await this.renumber(
        tx,
        project.milestones.filter((m) => m.id !== milestoneId).map((m) => m.id),
      );
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'milestone.delete',
        entity: 'Project',
        entityId: project.id,
        before: { milestoneId, number: milestone.number, title: milestone.title, amountMinor: milestone.amountMinor.toString() },
      });
      return project.id;
    });
    return this.projects.get(projectId, user);
  }

  async reorder(user: SessionUser, projectId: string, ids: string[]): Promise<ProjectDetail> {
    await this.prisma.$transaction(async (tx) => {
      const project = await this.projects.loadForWrite(projectId, user, tx);
      const current = project.milestones.map((m) => m.id);
      if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) {
        throw new AppError(400, 'VALIDATION_FAILED', "Send every one of this project's milestones exactly once.");
      }
      await this.renumber(tx, ids);
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'milestone.reorder',
        entity: 'Project',
        entityId: projectId,
        before: { order: current },
        after: { order: ids },
      });
    });
    return this.projects.get(projectId, user);
  }
}
