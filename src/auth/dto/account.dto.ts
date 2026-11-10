import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// bcrypt only uses the first 72 bytes of a password; longer ones would
// silently match on their prefix.
const MAX_PASSWORD = 72;

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  /** 8 to 72 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(MAX_PASSWORD)
  newPassword: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  /** The code from the password reset email. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;

  /** 8 to 72 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(MAX_PASSWORD)
  newPassword: string;
}

export class VerifyEmailDto {
  /** The code from the verification email. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;
}
