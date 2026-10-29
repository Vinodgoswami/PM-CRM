import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
