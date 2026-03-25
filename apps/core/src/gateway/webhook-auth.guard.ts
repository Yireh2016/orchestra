import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebhookAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const provider = request.params.provider;

    switch (provider) {
      case 'github':
        return this.validateGitHub(request);
      case 'jira':
        return this.validateJira(request);
      case 'slack':
        return this.validateSlack(request);
      default:
        throw new UnauthorizedException(`Unknown provider: ${provider}`);
    }
  }

  private async validateGitHub(request: Request): Promise<boolean> {
    const signature = request.headers['x-hub-signature-256'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing GitHub signature');
    }

    const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET', '');
    const body = JSON.stringify(request.body);
    const expected =
      'sha256=' +
      createHmac('sha256', secret).update(body).digest('hex');

    try {
      const sigBuffer = Buffer.from(signature);
      const expBuffer = Buffer.from(expected);
      if (
        sigBuffer.length !== expBuffer.length ||
        !timingSafeEqual(sigBuffer, expBuffer)
      ) {
        throw new UnauthorizedException('Invalid GitHub signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid GitHub signature');
    }

    return true;
  }

  private async validateJira(request: Request): Promise<boolean> {
    const token = request.headers['authorization'] as string;
    if (!token) {
      throw new UnauthorizedException('Missing Jira authorization');
    }

    const expectedToken = this.configService.get<string>(
      'JIRA_WEBHOOK_TOKEN',
      '',
    );

    if (token !== `Bearer ${expectedToken}`) {
      throw new UnauthorizedException('Invalid Jira webhook token');
    }

    return true;
  }

  private async validateSlack(request: Request): Promise<boolean> {
    const timestamp = request.headers['x-slack-request-timestamp'] as string;
    const slackSignature = request.headers['x-slack-signature'] as string;

    if (!timestamp || !slackSignature) {
      throw new UnauthorizedException('Missing Slack signature headers');
    }

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      throw new UnauthorizedException('Slack request too old');
    }

    const signingSecret = this.configService.get<string>(
      'SLACK_SIGNING_SECRET',
      '',
    );
    const body = JSON.stringify(request.body);
    const sigBaseString = `v0:${timestamp}:${body}`;
    const expectedSignature =
      'v0=' +
      createHmac('sha256', signingSecret)
        .update(sigBaseString)
        .digest('hex');

    try {
      const sigBuffer = Buffer.from(slackSignature);
      const expBuffer = Buffer.from(expectedSignature);
      if (
        sigBuffer.length !== expBuffer.length ||
        !timingSafeEqual(sigBuffer, expBuffer)
      ) {
        throw new UnauthorizedException('Invalid Slack signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    return true;
  }
}
