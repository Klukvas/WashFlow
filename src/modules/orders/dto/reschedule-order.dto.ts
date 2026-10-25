import { IsDateString, IsUUID, Matches, ValidateIf } from 'class-validator';

export class RescheduleOrderDto {
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'scheduledStart must include a timezone offset or Z',
  })
  scheduledStart: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  workPostId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  assignedEmployeeId?: string;
}
