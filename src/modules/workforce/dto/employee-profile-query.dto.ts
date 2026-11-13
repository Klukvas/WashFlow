import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { BooleanQuery } from '../../../common/utils/boolean-query.transform';
import { PaginationDto } from '../../../common/utils/pagination.dto';

export class EmployeeProfileQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'position', 'active'])
  declare sortBy?: 'createdAt' | 'updatedAt' | 'position' | 'active';
}
