import { afterAll, beforeEach, expect, test } from 'vitest';
import { createPrismaClient } from '../src/index';
import { resetDatabase } from '../src/testing';

const prisma = createPrismaClient(process.env.DATABASE_URL);

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedPayment(amountMinor = 5000n) {
  const user = await prisma.user.create({ data: { name: 'Admin', email: 'admin@example.com', role: 'ADMIN' } });
  const client = await prisma.client.create({ data: { name: 'Acme', createdById: user.id } });
  const project = await prisma.project.create({
    data: {
      code: 'PRJ-0001',
      name: 'Website',
      description: 'Redesign',
      clientId: client.id,
      ownerId: user.id,
      status: 'ACTIVE',
      expectedAmountMinor: 100000n,
      currency: 'INR',
      createdById: user.id,
    },
  });
  const milestone = await prisma.milestone.create({
    data: { projectId: project.id, number: 1, title: 'Design', amountMinor: 50000n, createdById: user.id },
  });
  const payment = await prisma.payment.create({
    data: {
      milestoneId: milestone.id,
      milestoneLabel: 'M1',
      paymentDate: new Date('2026-10-01'),
      amountMinor,
      createdById: user.id,
    },
  });
  return { user, payment };
}

test('P-4 payment amount cannot be updated', async () => {
  const { payment } = await seedPayment();
  await expect(prisma.payment.update({ where: { id: payment.id }, data: { amountMinor: 1n } })).rejects.toThrow(/payment_immutable/);
});

test('P-4 invoiceId, paymentDate, milestoneLabel and note can be updated', async () => {
  const { payment } = await seedPayment();
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { invoiceId: 'INV-7', paymentDate: new Date('2026-10-02'), milestoneLabel: 'M1a', note: 'late' },
  });
  expect(updated.invoiceId).toBe('INV-7');
  expect(updated.amountMinor).toBe(5000n);
});

test('P-7 payment cannot be deleted', async () => {
  const { payment } = await seedPayment();
  await expect(prisma.payment.delete({ where: { id: payment.id } })).rejects.toThrow(/payment_immutable/);
});

test('audit log is append-only', async () => {
  const { user } = await seedPayment();
  const row = await prisma.auditLog.create({ data: { actorId: user.id, action: 'test', entity: 'Payment', entityId: 'x' } });
  await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'changed' } })).rejects.toThrow(/append_only/);
  await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append_only/);
});

test('bigint money round-trips without loss', async () => {
  const { payment } = await seedPayment(9007199254740991n);
  const read = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  expect(read.amountMinor).toBe(9007199254740991n);
});
