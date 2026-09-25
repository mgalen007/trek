import { IsString, IsOptional, IsEmail, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(3)
  @IsOptional()
  firstName?: string;

  @IsString()
  @MinLength(3)
  @IsOptional()
  lastName?: string;
}
