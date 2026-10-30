import { Controller, Get, Query } from '@nestjs/common';
import { type FxRateDto, fxRateQuerySchema } from '@salescrm/schemas';
import { type z } from 'zod';
import { Authenticated } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { FxService } from './fx.service';

@Controller('fx-rate')
export class FxController {
  constructor(private readonly fx: FxService) {}

  /** Pre-fills the rate on the Mark-as-paid form; the user may change it. */
  @Get()
  @Authenticated()
  rate(@Query(new ZodValidationPipe(fxRateQuerySchema)) q: z.infer<typeof fxRateQuerySchema>): Promise<FxRateDto> {
    return this.fx.get(q.from, q.to, q.date);
  }
}
