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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ description: 'Branch ID' })
  @IsUUID()
  branchId: string;

  @ApiPropertyOptional({ description: 'Preferred work post ID' })
  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @ApiProperty({
    description: 'Scheduled start time (ISO 8601)',
    example: '2026-03-25T10:00:00Z',
  })
  @IsDateString()
  scheduledStart: string;

  @ApiProperty({ description: 'Service IDs to book', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds: string[];

  // Client info (for new or existing client lookup)
  @ApiProperty({ description: 'Client first name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiPropertyOptional({ description: 'Client last name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ description: 'Client phone number', example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\+?[\d\s\-().]+$/, { message: 'Invalid phone number format' })
  phone: string;

  @ApiPropertyOptional({ description: 'Client email address' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // Vehicle info
  @ApiProperty({ description: 'Vehicle license plate' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  licensePlate: string;

  @ApiPropertyOptional({ description: 'Vehicle make' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleMake?: string;

  @ApiPropertyOptional({ description: 'Vehicle model' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleModel?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
