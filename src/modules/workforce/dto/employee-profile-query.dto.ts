import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/utils/pagination.dto';

export class EmployeeProfileQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'position', 'active'])
  declare sortBy?: 'createdAt' | 'updatedAt' | 'position' | 'active';
}
