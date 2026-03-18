import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  make: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;
}
