import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY, type Role } from '../types/auth.types';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
