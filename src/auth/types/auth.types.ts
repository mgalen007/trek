export interface AuthenticatedUser {
  id: string;
  email: string;
}

export enum Role {
  ADMIN = "admin",
  USER = "user"
}

export const ROLES_KEY = 'roles'
