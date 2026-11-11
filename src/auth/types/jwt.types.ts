import type { Role } from '../types/auth.types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Present on agent tokens (POST /auth/agent-token); absent on users' own. */
  kind?: 'agent';
  iat?: number;
  exp?: number;
}
