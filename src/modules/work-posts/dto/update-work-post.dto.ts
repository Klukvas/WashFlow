import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateWorkPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
