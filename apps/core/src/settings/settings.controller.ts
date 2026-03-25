import { Controller, Get, Patch, Post, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    return this.settingsService.getAllSettings();
  }

  @Patch()
  async updateSettings(@Body() body: Record<string, string>) {
    return this.settingsService.updateSettings(body);
  }

  @Post('test-oauth')
  async testOAuth() {
    return this.settingsService.testOAuthConfig();
  }
}
