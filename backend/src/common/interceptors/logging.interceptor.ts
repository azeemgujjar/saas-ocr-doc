import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

// One log line per request (method, path, status, duration, tenantId).
// Also sets an x-request-id header so a request can be traced in the logs.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    const tenantId = (req as any).user?.tenantId || '-';

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - startedAt;
          this.logger.log(
            `[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms tenant=${tenantId}`,
          );
        },
        error: () => {
          const ms = Date.now() - startedAt;
          this.logger.warn(
            `[${requestId}] ${req.method} ${req.originalUrl} -> ERROR ${ms}ms tenant=${tenantId}`,
          );
        },
      }),
    );
  }
}
