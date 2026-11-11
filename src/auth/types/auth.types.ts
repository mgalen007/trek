export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  /** True when the request uses an agent token: drafting only. */
  agent?: boolean;
}

export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export const ROLES_KEY = 'roles';
