import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateWorkPostDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
