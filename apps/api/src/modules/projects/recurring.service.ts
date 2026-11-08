import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type AppConfig } from '@salescrm/config';
import { dueRecurringIndexes, type IsoDate, recurringDates } from '@salescrm/core';
import { type Prisma } from '@salescrm/database';
import { type CreateRecurringInput, type ProjectDetail } from '@salescrm/schemas';
import { minorFromJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { notFound } from '../../common/errors';
import { APP_CONFIG } from '../../config.module';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';
import { SettingsService } from '../settings/settings.service';
import { isoDate } from './project-money';
import { ProjectsService } from './projects.service';

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const titleOf = (title: string, i: number, count: number) => `${title} (${i + 1}/${count})`;

/**
 * D-063: monthly recurring milestones. A series makes `count` milestones on the start date's day each month; each is
 * created once its date arrives: right away for months already past, then by a catch-up that runs on the first
 * request of each day and at startup (a free host sleeps, so a timer could miss a month; the catch-up never does).
 */
@Injectable()
export class RecurringService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Recurring');
  private lastDay: string | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    // Tests start and stop the app constantly; the first request of the day still catches up there.
    if (this.config.nodeEnv === 'test') return;
    void this.syncIfNewDay().catch((e: unknown) => this.logger.warn(`Startup catch-up failed: ${String(e)}`));
  }

  /** Runs the catch-up once per company day; concurrent callers share one run. */
  async syncIfNewDay(): Promise<void> {
    const today = await this.settings.today();
    if (this.lastDay === today) return;
    this.running ??= this.syncAll(today)
      .then(() => {
        this.lastDay = today;
      })
      .finally(() => {
        this.running = null;
      });
    await this.running;
  }

  /** Creates every recurring milestone due by `today` that does not exist yet. */
  async syncAll(today: IsoDate): Promise<void> {
    const open = await this.prisma.recurringSeries.findMany({
      where: { startDate: { lte: toDate(today) } },
      select: { id: true, count: true, createdCount: true },
    });
    for (const s of open.filter((x) => x.createdCount < x.count)) {
      await this.prisma.$transaction((tx) => this.generate(tx, s.id, today));
    }
  }

  async create(user: SessionUser, projectId: string, input: CreateRecurringInput): Promise<ProjectDetail> {
    const today = await this.settings.today();
    await this.prisma.$transaction(async (tx) => {
      await this.projects.loadForWrite(projectId, user, tx);
      const series = await tx.recurringSeries.create({
        data: {
          projectId,
          title: input.title,
          amountMinor: minorFromJson(input.amountMinor),
          startDate: toDate(input.startDate),
          count: input.count,
          createdById: user.id,
        },
      });
      await this.generate(tx, series.id, today);
      // MS-5: the whole series, months still to come included, must fit the project's value.
      await this.projects.assertMilestonesWithinValue(tx, projectId);
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'milestone.recurring.create',
        entity: 'Project',
        entityId: projectId,
        after: {
          seriesId: series.id,
          title: input.title,
          amountMinor: String(input.amountMinor),
          startDate: input.startDate,
          count: input.count,
        },
      });
    });
    return this.projects.get(projectId, user);
  }

  /** Adds `months` more invoices to the series (renumbering the "n/count" in its milestones' tasks). */
  async extend(user: SessionUser, seriesId: string, months: number): Promise<ProjectDetail> {
    return this.resize(user, seriesId, (s) => s.count + months, 'milestone.recurring.extend');
  }

  /** No more invoices: the series ends with the ones already created. */
  async stop(user: SessionUser, seriesId: string): Promise<ProjectDetail> {
    return this.resize(user, seriesId, (s) => s.createdCount, 'milestone.recurring.stop');
  }

  private async resize(
    user: SessionUser,
    seriesId: string,
    next: (s: { count: number; createdCount: number }) => number,
    action: string,
  ): Promise<ProjectDetail> {
    const today = await this.settings.today();
    const projectId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RecurringSeries" WHERE id = ${seriesId} FOR UPDATE`;
      const s = await tx.recurringSeries.findUnique({ where: { id: seriesId } });
      if (!s) throw notFound();
      await this.projects.loadForWrite(s.projectId, user, tx);
      const count = next(s);
      await tx.recurringSeries.update({ where: { id: seriesId }, data: { count } });
      // Tasks still named by the series follow the new total ("Support (2/12)" → "(2/14)"); edited ones are kept.
      const own = await tx.milestone.findMany({
        where: { recurringSeriesId: seriesId },
        select: { id: true, title: true, recurringIndex: true },
      });
      for (const m of own) {
        if (m.recurringIndex !== null && m.title === titleOf(s.title, m.recurringIndex, s.count)) {
          await tx.milestone.update({ where: { id: m.id }, data: { title: titleOf(s.title, m.recurringIndex, count) } });
        }
      }
      await this.generate(tx, seriesId, today);
      await this.projects.assertMilestonesWithinValue(tx, s.projectId);
      await this.audit.record(tx, {
        actorId: user.id,
        action,
        entity: 'Project',
        entityId: s.projectId,
        before: { seriesId, count: s.count },
        after: { seriesId, count },
      });
      return s.projectId;
    });
    return this.projects.get(projectId, user);
  }

  /** Creates the series' milestones due by `today`, numbered after the project's last milestone. */
  private async generate(tx: Prisma.TransactionClient, seriesId: string, today: IsoDate): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "RecurringSeries" WHERE id = ${seriesId} FOR UPDATE`;
    const s = await tx.recurringSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const start = isoDate(s.startDate)!;
    const due = dueRecurringIndexes(start, s.count, s.createdCount, today);
    if (due.length === 0) return;
    const dates = recurringDates(start, s.count);
    // Same lock as other milestone writes on the project, so numbers stay 1..n (MS-1).
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${s.projectId} FOR UPDATE`;
    let number = (await tx.milestone.aggregate({ where: { projectId: s.projectId }, _max: { number: true } }))._max.number ?? 0;
    for (const i of due) {
      number += 1;
      await tx.milestone.create({
        data: {
          projectId: s.projectId,
          number,
          title: titleOf(s.title, i, s.count),
          amountMinor: s.amountMinor,
          dueDate: toDate(dates[i]!),
          createdById: s.createdById,
          recurringSeriesId: s.id,
          recurringIndex: i,
        },
      });
    }
    await tx.recurringSeries.update({ where: { id: s.id }, data: { createdCount: due.at(-1)! + 1 } });
  }
}
