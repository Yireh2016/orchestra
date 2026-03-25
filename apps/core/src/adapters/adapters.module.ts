import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PM_ADAPTER } from './interfaces/pm-adapter.interface';
import { CODE_HOST_ADAPTER } from './interfaces/code-host-adapter.interface';
import { CHANNEL_ADAPTER } from './interfaces/channel-adapter.interface';
import { CODING_AGENT_ADAPTER } from './interfaces/coding-agent-adapter.interface';
import { JiraAdapter } from './pm/jira/jira.adapter';
import { GitHubAdapter } from './code-host/github/github.adapter';
import { SlackAdapter } from './channel/slack/slack.adapter';
import { JiraCommentsAdapter } from './channel/jira-comments/jira-comments.adapter';
import { ClaudeCodeAdapter } from './coding-agent/claude-code/claude-code.adapter';
import { AdapterConfigService } from './adapter-config.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({})
export class AdaptersModule {
  static forRoot(): DynamicModule {
    return {
      module: AdaptersModule,
      global: true,
      imports: [IntegrationsModule],
      providers: [
        AdapterConfigService,
        JiraAdapter,
        GitHubAdapter,
        SlackAdapter,
        JiraCommentsAdapter,
        ClaudeCodeAdapter,
        {
          provide: PM_ADAPTER,
          useFactory: (configService: ConfigService, jira: JiraAdapter) => {
            const pmType = configService.get<string>('PM_ADAPTER', 'jira');
            switch (pmType) {
              case 'jira':
              default:
                return jira;
            }
          },
          inject: [ConfigService, JiraAdapter],
        },
        {
          provide: CODE_HOST_ADAPTER,
          useFactory: (configService: ConfigService, github: GitHubAdapter) => {
            const hostType = configService.get<string>('CODE_HOST_ADAPTER', 'github');
            switch (hostType) {
              case 'github':
              default:
                return github;
            }
          },
          inject: [ConfigService, GitHubAdapter],
        },
        {
          provide: CHANNEL_ADAPTER,
          useFactory: (
            configService: ConfigService,
            slack: SlackAdapter,
            jiraComments: JiraCommentsAdapter,
          ) => {
            const channelType = configService.get<string>('CHANNEL_ADAPTER', 'slack');
            switch (channelType) {
              case 'jira-comments':
                return jiraComments;
              case 'slack':
              default:
                return slack;
            }
          },
          inject: [ConfigService, SlackAdapter, JiraCommentsAdapter],
        },
        {
          provide: CODING_AGENT_ADAPTER,
          useFactory: (
            configService: ConfigService,
            claudeCode: ClaudeCodeAdapter,
          ) => {
            const agentType = configService.get<string>('CODING_AGENT_ADAPTER', 'claude-code');
            switch (agentType) {
              case 'claude-code':
              default:
                return claudeCode;
            }
          },
          inject: [ConfigService, ClaudeCodeAdapter],
        },
      ],
      exports: [
        PM_ADAPTER,
        CODE_HOST_ADAPTER,
        CHANNEL_ADAPTER,
        CODING_AGENT_ADAPTER,
        AdapterConfigService,
      ],
    };
  }
}
