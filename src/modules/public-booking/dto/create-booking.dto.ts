import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
  IsEmail,
  MaxLength,
  Matches,
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
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds: string[];

  // Client info (for new or existing client lookup)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\+?[\d\s\-().]+$/, { message: 'Invalid phone number format' })
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // Vehicle info
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  licensePlate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleMake?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
