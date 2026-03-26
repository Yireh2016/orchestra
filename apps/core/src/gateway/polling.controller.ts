import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PollingService } from './polling.service';

@Controller('polling')
export class PollingController {
  constructor(private readonly pollingService: PollingService) {}

  @Get('status')
  getStatus() {
    return this.pollingService.getStatus();
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  start() {
    this.pollingService.start();
    return { message: 'Polling started' };
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stop() {
    this.pollingService.stop();
    return { message: 'Polling stopped' };
  }

  @Patch('config')
  updateConfig(@Body() body: { intervalMs?: number }) {
    if (body.intervalMs !== undefined) {
      if (typeof body.intervalMs !== 'number' || body.intervalMs < 1000) {
        throw new BadRequestException(
          'intervalMs must be a number >= 1000',
        );
      }
      this.pollingService.updateInterval(body.intervalMs);
    }
    return this.pollingService.getStatus();
  }
}
