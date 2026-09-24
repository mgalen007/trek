import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AuthenticatedRequest } from '../types/req.types'

export const CurrentUser = createParamDecorator(
  (_data: any, ctx: ExecutionContext) => {
    const req: AuthenticatedRequest = ctx.switchToHttp().getRequest()

    return {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    }
  }
)