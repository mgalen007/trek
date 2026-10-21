import {
  Controller,
  Get,
  Put,
  Delete,
  UseGuards,
  Param,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import type { ICurrentUser } from '../auth/types/user.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
} from 'common/http/api-response.decorators';

@ApiTags('Users')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a user by id',
    description:
      'Users can only read themselves (admins: anyone); other users are reported as not found.',
  })
  @ApiDataResponse(UserEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async findById(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const user = await this.usersService.findOneById(id, currentUser);

    return user;
  }

  @AdminOnly()
  @Get()
  @ApiOperation({ summary: 'List all users (admin)' })
  @ApiDataResponse(UserEntity, { isArray: true })
  async findAll() {
    const users = await this.usersService.findAll();

    return users;
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Users can update themselves (admins: anyone); other users are reported as not found.',
  })
  @ApiDataResponse(UserEntity)
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    { [HttpStatus.CONFLICT]: 'Email already registered (ALREADY_EXISTS)' },
  )
  async update(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: UpdateUserDto,
  ) {
    const updatedUser = await this.usersService.update(id, currentUser, dto);

    return updatedUser;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user',
    description:
      "Users can delete themselves (admins: anyone). Also deletes the user's itineraries, travelers and preferences; upcoming confirmed itineraries must be cancelled first.",
  })
  @ApiDataResponse(UserEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]:
      'Upcoming confirmed itineraries exist (HAS_ACTIVE_BOOKINGS)',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const user = await this.usersService.remove(id, currentUser);

    return user;
  }
}
