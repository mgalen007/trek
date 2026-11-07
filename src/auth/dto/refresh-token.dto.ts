import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  /** A refresh token from login or a previous refresh. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  refreshToken: string;
}
