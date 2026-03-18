import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;
}
