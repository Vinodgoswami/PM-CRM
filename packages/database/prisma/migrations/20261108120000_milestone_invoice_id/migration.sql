-- D-047: a milestone's invoice ID, kept apart from its task.
ALTER TABLE "Milestone" ADD COLUMN "invoiceId" TEXT;
