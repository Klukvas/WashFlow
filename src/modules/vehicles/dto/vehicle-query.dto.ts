import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/utils/pagination.dto';

export class VehicleQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
