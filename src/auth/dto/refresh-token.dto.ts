import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  /**
   * A refresh token from login or a previous refresh. Browsers can leave it
   * out: the `trek_refresh` cookie is used instead.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  refreshToken?: string;
}
