import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CheckOrderAvailabilityDto {
  @IsUUID()
  branchId: string;

  @IsDateString({ strict: true })
  date: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes = 30;

  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @IsOptional()
  @IsUUID()
  assignedEmployeeId?: string;
  @IsOptional()
  @IsUUID()
  excludeOrderId?: string;
}
