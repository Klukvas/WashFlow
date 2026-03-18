import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens only',
  })
  slug: string;
}
