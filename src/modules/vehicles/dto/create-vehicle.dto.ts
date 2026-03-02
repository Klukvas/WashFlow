import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  @IsString()
  @IsNotEmpty()
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
