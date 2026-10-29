-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- Money guards (docs/06 P-2, P-5): no zero amounts; only reversal rows are negative, and reversals always are.
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_nonzero" CHECK ("amountMinor" <> 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_reversal_sign" CHECK (("reversesPaymentId" IS NULL) = ("amountMinor" > 0));
