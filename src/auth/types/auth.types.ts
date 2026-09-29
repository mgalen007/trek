export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export const ROLES_KEY = 'roles';
