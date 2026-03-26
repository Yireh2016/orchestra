import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { RepoScannerService } from './repo-scanner.service';

interface CreateProjectDto {
  name: string;
  description?: string;
  repositories?: Array<{ url: string; defaultBranch?: string; path?: string }>;
  pmProjectKey?: string;
  integrations?: Record<string, string>;
  context?: string;
  teamId?: string;
}

interface UpdateProjectDto {
  name?: string;
  description?: string;
  repositories?: Array<{ url: string; defaultBranch?: string; path?: string }>;
  pmProjectKey?: string;
  integrations?: Record<string, string>;
  context?: string;
  teamId?: string;
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repoScanner: RepoScannerService,
  ) {}

  async create(data: CreateProjectDto) {
    // Auto-detect pmProjectKey from first repo URL if not provided
    let pmProjectKey = data.pmProjectKey;
    if (!pmProjectKey && data.repositories?.length) {
      pmProjectKey = this.detectPmKeyFromRepoUrl(data.repositories[0].url) ?? undefined;
    }

    return this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description ?? '',
        repositories: (data.repositories as any) ?? [],
        pmProjectKey: pmProjectKey ?? null,
        integrations: (data.integrations as any) ?? {},
        context: data.context ?? '',
        teamId: data.teamId ?? null,
      },
    });
  }

  async findAll(teamId?: string) {
    return this.prisma.project.findMany({
      where: teamId ? { teamId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        team: true,
        workflowRuns: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  async update(id: string, data: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.repositories !== undefined && {
          repositories: data.repositories as any,
        }),
        ...(data.pmProjectKey !== undefined && {
          pmProjectKey: data.pmProjectKey,
        }),
        ...(data.integrations !== undefined && {
          integrations: data.integrations as any,
        }),
        ...(data.context !== undefined && { context: data.context }),
        ...(data.teamId !== undefined && { teamId: data.teamId }),
      },
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    await this.prisma.project.delete({ where: { id } });
  }

  async findByPmKey(key: string) {
    return this.prisma.project.findFirst({
      where: { pmProjectKey: key },
    });
  }

  async scanRepositories(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    const repositories = project.repositories as Array<{
      url: string;
      defaultBranch?: string;
      path?: string;
    }>;

    if (!repositories.length) {
      throw new NotFoundException(
        `Project ${id} has no repositories to scan`,
      );
    }

    this.logger.log(`Scanning repositories for project ${id}`);
    const context =
      await this.repoScanner.scanAndGenerateContext(repositories);

    return this.prisma.project.update({
      where: { id },
      data: {
        context,
        contextGeneratedAt: new Date(),
      },
    });
  }

  /**
   * Attempt to detect a PM project key from a repository URL.
   * Looks for common patterns like the repo name being the key.
   */
  private detectPmKeyFromRepoUrl(url: string): string | null {
    const slug = this.repoScanner.extractRepoSlug(url);
    if (!slug) return null;
    const repoName = slug.split('/')[1];
    if (!repoName) return null;
    // If repo name looks like an uppercase project key (e.g., "RMK", "CORE")
    if (/^[A-Z][A-Z0-9_-]+$/.test(repoName)) {
      return repoName;
    }
    return null;
  }
}
