import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

export class DaySummaryQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date: string;
}
