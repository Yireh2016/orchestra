import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { PluginRegistryService } from './plugin-registry.service';
import { Plugin, PluginType } from './plugin.interface';

@Injectable()
export class PluginLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PluginLoaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
  ) {}

  async onModuleInit() {
    await this.loadPlugins();
  }

  async loadPlugins(): Promise<void> {
    this.logger.log('Loading plugins from database...');

    try {
      const pluginRecords = await this.prisma.plugin.findMany({
        where: { enabled: true },
      });

      for (const record of pluginRecords) {
        try {
          const plugin = await this.instantiatePlugin(record);
          if (plugin) {
            await this.registry.register(plugin);
          }
        } catch (error: any) {
          this.logger.error(
            `Failed to load plugin ${record.name}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Loaded ${this.registry.getAll().length} plugins`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Could not load plugins from database: ${error.message}`,
      );
    }
  }

  async reloadPlugin(pluginId: string): Promise<void> {
    const record = await this.prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!record) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    await this.registry.unregister(
      record.type as PluginType,
      record.name,
    );

    if (record.enabled) {
      const plugin = await this.instantiatePlugin(record);
      if (plugin) {
        await this.registry.register(plugin);
      }
    }
  }

  private async instantiatePlugin(record: {
    name: string;
    type: string;
    version: string;
    config: unknown;
  }): Promise<Plugin | null> {
    const config = record.config as Record<string, unknown>;

    const plugin: Plugin = {
      name: record.name,
      version: record.version,
      type: record.type as PluginType,
      async register() {
        // Plugin-specific initialization using config
      },
      async unregister() {
        // Plugin-specific cleanup
      },
    };

    return plugin;
  }
}
