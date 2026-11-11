import type { Role } from './auth.types';

export interface IUser {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  agent?: boolean;
}

export type ICurrentUser = Pick<IUser, 'id' | 'role' | 'email' | 'agent'>;
