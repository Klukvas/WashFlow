import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsDateString,
  IsArray,
  ArrayMinSize,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @IsDateString()
  scheduledStart: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  serviceIds: string[];

  // Client info (for new or existing client lookup)
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Vehicle info
  @IsString()
  @IsNotEmpty()
  licensePlate: string;

  @IsOptional()
  @IsString()
  vehicleMake?: string;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
