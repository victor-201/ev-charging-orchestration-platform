import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainException } from '../../domain/exceptions/domain.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const requestId = ctx.getRequest().headers?.['x-request-id'] || ctx.getRequest().headers?.['x-correlation-id'] || '';

    if (exception instanceof DomainException) {
      this.logger.warn(`[DomainException] ${exception.message}`);
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: exception.message,
        requestId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message = typeof res === 'object' ? (res as any).message : res;
      
      if (status === HttpStatus.BAD_REQUEST) {
        this.logger.warn(`[BadRequest] ${JSON.stringify(message)}`);
      }

      response.status(status).json(typeof res === 'string' ? { statusCode: status, message: res, requestId } : { ...res as object, requestId });
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`[UnhandledException] ${err.message}`, err.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      requestId,
    });
  }
}
