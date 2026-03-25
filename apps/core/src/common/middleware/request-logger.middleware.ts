import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      Logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
        'HTTP',
      );
    });
    next();
  }
}
