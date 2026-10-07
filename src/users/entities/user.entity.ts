import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../auth/types/auth.types';

/** A user account. The password hash is never returned. */
export class UserEntity {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
