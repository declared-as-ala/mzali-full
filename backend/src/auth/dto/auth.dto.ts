import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /** "admin" (legacy console username) or an employee email. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
