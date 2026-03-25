import { Module } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';

@Module({
  providers: [PluginRegistryService, PluginLoaderService],
  exports: [PluginRegistryService, PluginLoaderService],
})
export class PluginsModule {}
