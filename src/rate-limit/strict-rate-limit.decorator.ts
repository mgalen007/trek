import { ExecutionContext, SetMetadata } from '@nestjs/common';

const STRICT_RATE_LIMIT = 'strictRateLimit';

/**
 * Adds the tighter "auth" limit (AUTH_RATE_LIMIT_PER_MINUTE) on top of the
 * default one, for routes worth guessing at, like login.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT, true);

export const isStrictRateLimited = (context: ExecutionContext) =>
  Reflect.getMetadata(STRICT_RATE_LIMIT, context.getHandler()) === true;
