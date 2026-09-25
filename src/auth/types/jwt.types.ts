import type { Role } from '../types/auth.types'

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
