import { IsEmail, IsString, MinLength, IsUUID } from 'class-validator';

export class LoginDto {
  @IsUUID()
  tenantId: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
