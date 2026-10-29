import { Body, Controller, Headers, Param, Patch, Post, Res } from '@nestjs/common';
import {
  type CreatePaymentInput,
  createPaymentSchema,
  type PaymentDto,
  reversePaymentSchema,
  type UpdatePaymentMetaInput,
  updatePaymentMetaSchema,
} from '@salescrm/schemas';
import { type Response } from 'express';
import { type z } from 'zod';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('milestones/:id/payments')
  @RequirePermission('payments.create')
  async create(
    @CurrentUser() user: SessionUser,
    @Param('id') milestoneId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentDto> {
    const { payment, created } = await this.payments.create(user, milestoneId, key, body);
    res.status(created ? 201 : 200);
    return payment;
  }

  @Patch('payments/:id')
  @RequirePermission('payments.editMeta')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentMetaSchema)) body: UpdatePaymentMetaInput,
  ): Promise<PaymentDto> {
    return this.payments.updateMeta(user, id, body);
  }

  @Post('payments/:id/reverse')
  @RequirePermission('payments.reverse')
  reverse(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reversePaymentSchema)) body: z.infer<typeof reversePaymentSchema>,
  ): Promise<PaymentDto> {
    return this.payments.reverse(user, id, body.reason);
  }
}
