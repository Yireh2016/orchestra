import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Logger,
} from '@nestjs/common';
import { ProjectService } from './project.service';

@Controller('projects')
export class ProjectController {
  private readonly logger = new Logger(ProjectController.name);

  constructor(private readonly projectService: ProjectService) {}

  @Get()
  findAll(@Query('teamId') teamId?: string) {
    return this.projectService.findAll(teamId);
  }

  @Get('by-key/:key')
  findByPmKey(@Param('key') key: string) {
    return this.projectService.findByPmKey(key);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      repositories?: Array<{
        url: string;
        defaultBranch?: string;
        path?: string;
      }>;
      pmProjectKey?: string;
      integrations?: Record<string, string>;
      context?: string;
      teamId?: string;
    },
  ) {
    return this.projectService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      repositories?: Array<{
        url: string;
        defaultBranch?: string;
        path?: string;
      }>;
      pmProjectKey?: string;
      integrations?: Record<string, string>;
      context?: string;
      teamId?: string;
    },
  ) {
    return this.projectService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.projectService.delete(id);
  }

  @Post(':id/scan')
  async scanRepositories(@Param('id') id: string) {
    this.logger.log(`Triggering repository scan for project ${id}`);
    return this.projectService.scanRepositories(id);
  }
}
