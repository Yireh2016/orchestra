import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get()
  findAll(@Query('teamId') teamId?: string) {
    return this.integrationService.findAll(teamId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.integrationService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateIntegrationDto) {
    return this.integrationService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.integrationService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.integrationService.delete(id);
  }

  @Post(':id/test')
  testConnection(@Param('id') id: string) {
    return this.integrationService.testConnection(id);
  }
}
