import { AuthGuard } from '@nestjs/passport';
import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError, ErrorCode } from 'common/http/api-error';
import { AGENT_ALLOWED } from '../decorators/agent-allowed.decorator';
import type { AuthenticatedUser } from '../types/auth.types';

/**
 * Bearer-token authentication. Agent tokens are only accepted on routes
 * marked @AgentAllowed(): deny by default, enforced here so it covers every
 * protected route.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    const allowed = this.reflector.getAllAndOverride<boolean>(AGENT_ALLOWED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (user.agent && !allowed)
      throw new ForbiddenException(
        apiError(
          ErrorCode.AGENT_NOT_ALLOWED,
          'The assistant cannot do this; the user has to do it themselves',
        ),
      );
    return true;
  }
}
