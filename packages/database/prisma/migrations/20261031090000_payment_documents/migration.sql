-- D-026: invoices and payment slips stored against a payment.
ALTER TABLE "Document" ADD COLUMN "paymentId" TEXT;
CREATE INDEX "Document_paymentId_idx" ON "Document"("paymentId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
