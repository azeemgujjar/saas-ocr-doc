import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Turns every exception into the same JSON error shape
 * ({ statusCode, error, message, requestId, timestamp, path }).
 * Internal error text is hidden in production; the full stack is still logged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const r = exceptionResponse as any;
        message = r.message || message;
        error = r.error || HttpStatus[status] || error;
      }
    } else if (exception instanceof Error) {
      // don't leak internal messages in prod
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message;
      }
    }

    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} -> ${status} ${
        typeof message === 'string' ? message : JSON.stringify(message)
      }`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
