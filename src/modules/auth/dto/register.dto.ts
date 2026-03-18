import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const PASSWORD_MESSAGE =
  'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 digit';

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;
}
