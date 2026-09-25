import { Controller, Delete, UseGuards, Param } from '@nestjs/common';
import { UsersService } from './users.service'
import type { ICurrentUser } from '../auth/types/user.types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'


@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() currentUser: ICurrentUser) {
    const user = await this.usersService.remove(id, currentUser)

    return user
  }
  
}
