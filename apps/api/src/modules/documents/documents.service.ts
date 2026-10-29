import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type DocumentDto, type RequestUploadInput, type UploadSlot } from '@salescrm/schemas';
import { type SessionUser } from '../../common/current-user';
import { AppError, notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, type StorageDriver } from '../storage/storage.driver';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /** Step 1 of docs/04 § Documents: a PENDING row plus a short-lived signed upload URL. */
  async requestUpload(user: SessionUser, projectId: string, input: RequestUploadInput): Promise<UploadSlot> {
    await this.projects.loadForWrite(projectId, user);
    const doc = await this.prisma.document.create({
      data: {
        projectId,
        name: input.name,
        type: input.type,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: `projects/${projectId}/${randomUUID()}`,
        uploadedById: user.id,
      },
    });
    const { url, headers } = await this.storage.presignPut(doc.storageKey, doc.mimeType, doc.sizeBytes);
    return { documentId: doc.id, url, headers };
  }

  /** Step 3: the object must exist with exactly the declared size and type, otherwise everything is discarded. */
  async confirm(user: SessionUser, id: string): Promise<DocumentDto> {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: { uploadedBy: { select: { id: true, name: true } } } });
    if (!doc || doc.status !== 'PENDING') throw notFound();
    await this.projects.loadForWrite(doc.projectId, user);
    const stored = await this.storage.head(doc.storageKey);
    if (!stored || stored.sizeBytes !== doc.sizeBytes || stored.mimeType !== doc.mimeType) {
      await this.storage.delete(doc.storageKey);
      await this.prisma.document.delete({ where: { id } });
      throw new AppError(400, 'VALIDATION_FAILED', 'The upload did not complete or does not match the file you chose. Please try again.');
    }
    const ready = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id },
        data: { status: 'READY' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'document.upload',
        entity: 'Project',
        entityId: doc.projectId,
        after: { documentId: id, name: doc.name, type: doc.type, sizeBytes: doc.sizeBytes },
      });
      return updated;
    });
    return toDto(ready);
  }

  async list(user: SessionUser, projectId: string): Promise<{ items: DocumentDto[] }> {
    await this.projects.load(projectId, user);
    const docs = await this.prisma.document.findMany({
      where: { projectId, status: 'READY' },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: docs.map(toDto) };
  }

  async download(user: SessionUser, id: string): Promise<{ url: string }> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || doc.status !== 'READY') throw notFound();
    await this.projects.load(doc.projectId, user);
    return { url: await this.storage.presignGet(doc.storageKey, doc.name) };
  }

  async remove(user: SessionUser, id: string): Promise<void> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw notFound();
    await this.projects.loadForWrite(doc.projectId, user);
    await this.prisma.$transaction(async (tx) => {
      await tx.document.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'document.delete',
        entity: 'Project',
        entityId: doc.projectId,
        before: { documentId: id, name: doc.name },
      });
    });
    await this.storage.delete(doc.storageKey);
  }
}

function toDto(d: {
  id: string;
  name: string;
  type: DocumentDto['type'];
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { id: string; name: string };
  createdAt: Date;
}): DocumentDto {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
  };
}
