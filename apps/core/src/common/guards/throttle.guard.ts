import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly requests = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 100, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key =
      request.ip || request.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    let record = this.requests.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + this.windowMs };
      this.requests.set(key, record);
    }

    record.count++;
    if (record.count > this.limit) {
      throw new HttpException('Too Many Requests', 429);
    }
    return true;
  }
}
