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
  @Matches(/^\d{2}:\d{2}$/, { message: 'workStartTime must be HH:MM format' })
  workStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'workEndTime must be HH:MM format' })
  workEndTime?: string;
}
