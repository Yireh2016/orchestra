import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { RepoScannerService } from './repo-scanner.service';
import { DatabaseModule } from '../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectController],
  providers: [ProjectService, RepoScannerService],
  exports: [ProjectService],
})
export class ProjectsModule {}
