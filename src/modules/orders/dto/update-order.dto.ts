import { IsOptional, IsString, IsDateString, IsUUID } from 'class-validator';

export class UpdateOrderDto {
  @IsOptional()
  @IsUUID()
  workPostId?: string;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
