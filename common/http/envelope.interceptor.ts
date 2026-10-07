import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs';
import { Page } from './page';

// Wraps every successful response as `{ data }`, or `{ data, pagination }`
// for list endpoints that return a Page.
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next
      .handle()
      .pipe(
        map((body: unknown) =>
          body instanceof Page
            ? { data: body.data, pagination: body.pagination }
            : { data: body ?? null },
        ),
      );
  }
}
