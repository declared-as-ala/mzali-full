import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateAttendanceEmployeeDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsString() @MinLength(4) phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @Matches(/^\d{4,6}$/, { message: 'Le code PIN doit contenir 4 à 6 chiffres.' }) pin!: string;
  @IsInt() @Min(0) hourlyRateMinor!: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() hiredAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAttendanceEmployeeDto {
  @IsOptional() @IsString() @MinLength(1) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) lastName?: string;
  @IsOptional() @IsString() @MinLength(4) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsInt() @Min(0) hourlyRateMinor?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() hiredAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ResetPinDto {
  @Matches(/^\d{4,6}$/, { message: 'Le code PIN doit contenir 4 à 6 chiffres.' }) pin!: string;
}

export class IdentifyDto {
  @IsString() pin!: string;
}

export class ClockActionDto {
  @IsString() pin!: string;
  @IsOptional() @IsString() source?: string;
}

export const PAYMENT_METHODS = ['cash', 'transfer', 'other'] as const;

export class CorrectSessionDto {
  @IsOptional() @IsString() clockIn?: string;
  @IsOptional() @IsString() clockOut?: string;
  @IsString() @MinLength(3) reason!: string;
}
