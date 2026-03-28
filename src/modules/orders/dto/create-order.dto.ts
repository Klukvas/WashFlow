import {
  IsUUID,
  IsArray,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { OrderSource } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'Branch ID' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ description: 'Client ID' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ description: 'Vehicle ID' })
  @IsUUID()
  vehicleId: string;

  @ApiPropertyOptional({ description: 'Work post ID' })
  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @ApiPropertyOptional({ description: 'Assigned employee ID' })
  @IsOptional()
  @IsUUID()
  assignedEmployeeId?: string;

  @ApiProperty({
    description: 'Scheduled start time (ISO 8601)',
    example: '2026-03-25T10:00:00Z',
  })
  @IsDateString()
  scheduledStart: string;

  @ApiProperty({
    description: 'Service IDs to include in the order',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  serviceIds: string[];

  @ApiPropertyOptional({
    description: 'Order source',
    enum: ['WALK_IN', 'PHONE', 'ONLINE', 'APP'],
  })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
