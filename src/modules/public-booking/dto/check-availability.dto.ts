import {
  IsUUID,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CheckAvailabilityDto {
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  durationMinutes?: number;
}
