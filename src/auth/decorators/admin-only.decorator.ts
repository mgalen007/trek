import { applyDecorators, HttpStatus, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';
import { Role } from '../types/auth.types';
import { ApiErrorResponses } from 'common/http/api-response.decorators';

/**
 * Restricts a route to admins and documents the 403. Must be used on a
 * controller or route that already applies JwtAuthGuard.
 */
export const AdminOnly = () =>
  applyDecorators(
    UseGuards(RolesGuard),
    Roles(Role.ADMIN),
    ApiErrorResponses([HttpStatus.FORBIDDEN], {
      [HttpStatus.FORBIDDEN]: 'Admins only (FORBIDDEN)',
    }),
  );
