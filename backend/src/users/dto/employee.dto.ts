import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { EmployeeRole } from '@contracts';
import { EMPLOYEE_ROLES } from '../employee.schema';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsIn(EMPLOYEE_ROLES)
  role?: EmployeeRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_ROLES)
  role?: EmployeeRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
