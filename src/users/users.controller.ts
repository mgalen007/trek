import {
  Controller,
  Get,
  Put,
  Delete,
  UseGuards,
  Param,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/types/auth.types';
import type { ICurrentUser } from '../auth/types/user.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    const user = await this.usersService.getUserById(id);

    return user;
  }

  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @Get()
  async getAllUsers() {
    const users = await this.usersService.getUsers();

    return users;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: UpdateUserDto,
  ) {
    const updatedUser = await this.usersService.update(id, currentUser, dto);

    return updatedUser;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const user = await this.usersService.remove(id, currentUser);

    return user;
  }
}
