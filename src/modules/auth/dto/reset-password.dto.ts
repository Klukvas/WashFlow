import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const PASSWORD_MESSAGE =
  'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 digit';

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
