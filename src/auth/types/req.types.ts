import { Request } from '@nestjs/common';
import type { IUser } from './user.types';

export interface AuthenticatedRequest extends Request {
  user: IUser;
}
