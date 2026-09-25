import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type Role } from '../types/auth.types';
import type { AuthenticatedRequest } from '../types/req.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const req: AuthenticatedRequest = ctx.switchToHttp().getRequest();
    const requiredRoles: Role[] = this.reflector.get(
      ROLES_KEY,
      ctx.getHandler(),
    );
    const userRole: Role = req.user.role;

    if (!requiredRoles) return true;
    return requiredRoles.includes(userRole);
  }
}
