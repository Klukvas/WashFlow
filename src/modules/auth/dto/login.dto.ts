import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
