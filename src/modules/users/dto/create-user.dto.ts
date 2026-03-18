import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
  })
  password: string;

  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[\d\s()-]{7,20}$/, { message: 'Invalid phone format' })
  phone?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;
}
