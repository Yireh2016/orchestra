import { Injectable, Logger } from '@nestjs/common';
import { Plugin, PluginType } from './plugin.interface';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly plugins = new Map<string, Plugin>();

  async register(plugin: Plugin): Promise<void> {
    const key = `${plugin.type}:${plugin.name}`;

    if (this.plugins.has(key)) {
      this.logger.warn(`Plugin ${key} already registered, replacing`);
      await this.unregister(plugin.type, plugin.name);
    }

    await plugin.register();
    this.plugins.set(key, plugin);
    this.logger.log(`Registered plugin ${key} v${plugin.version}`);
  }

  async unregister(type: PluginType, name: string): Promise<void> {
    const key = `${type}:${name}`;
    const plugin = this.plugins.get(key);

    if (plugin) {
      await plugin.unregister();
      this.plugins.delete(key);
      this.logger.log(`Unregistered plugin ${key}`);
    }
  }

  get(type: PluginType, name: string): Plugin | undefined {
    return this.plugins.get(`${type}:${name}`);
  }

  getByType(type: PluginType): Plugin[] {
    const result: Plugin[] = [];
    for (const [key, plugin] of this.plugins) {
      if (key.startsWith(`${type}:`)) {
        result.push(plugin);
      }
    }
    return result;
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  has(type: PluginType, name: string): boolean {
    return this.plugins.has(`${type}:${name}`);
  }
}
