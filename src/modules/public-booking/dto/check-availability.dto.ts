import { IsUUID, IsDateString, IsOptional, IsInt, Min } from 'class-validator';
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
  durationMinutes?: number;
}
