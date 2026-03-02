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

export class CreateOrderDto {
  @IsUUID()
  branchId: string;

  @IsUUID()
  clientId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @IsOptional()
  @IsUUID()
  assignedEmployeeId?: string;

  @IsDateString()
  scheduledStart: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  serviceIds: string[];

  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
