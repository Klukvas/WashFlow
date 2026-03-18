import {
  IsUUID,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class CreateEmployeeProfileDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsBoolean()
  isWorker?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  efficiencyCoefficient?: number;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'workStartTime must be HH:MM format',
  })
  workStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'workEndTime must be HH:MM format',
  })
  workEndTime?: string;
}
