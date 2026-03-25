import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { TemplateService } from './template.service';

@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  list(
    @Query('teamId') teamId?: string,
    @Query('isPublished') isPublished?: boolean,
  ) {
    return this.templateService.list({ teamId, isPublished });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description: string;
      phases: unknown[];
      triggerConfig: Record<string, unknown>;
      teamId: string;
    },
  ) {
    return this.templateService.create(body);
  }

  @Post(':id/clone')
  clone(@Param('id') id: string) {
    return this.templateService.clone(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      description: string;
      phases: unknown[];
      triggerConfig: Record<string, unknown>;
    }>,
  ) {
    return this.templateService.update(id, body);
  }

  @Patch(':id/publish')
  publish(
    @Param('id') id: string,
    @Body() body: { publish: boolean },
  ) {
    return body.publish
      ? this.templateService.publish(id)
      : this.templateService.unpublish(id);
  }
}
