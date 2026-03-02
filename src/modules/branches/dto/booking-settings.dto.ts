import {
  IsOptional,
  IsInt,
  IsBoolean,
  IsString,
  IsArray,
  ArrayUnique,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class UpdateBookingSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  bufferTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxAdvanceBookingDays?: number;

  @IsOptional()
  @IsBoolean()
  allowOnlineBooking?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'workingHoursStart must be HH:MM format',
  })
  workingHoursStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'workingHoursEnd must be HH:MM format' })
  workingHoursEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays?: number[];
}
