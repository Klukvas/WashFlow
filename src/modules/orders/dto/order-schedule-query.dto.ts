import { IsDateString, IsUUID, Matches } from 'class-validator';

export class OrderScheduleQueryDto {
  @IsUUID()
  branchId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date: string;
}
