import { IsOptional, IsUUID, IsEnum, IsDateString } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/utils/pagination.dto';

export class OrderQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
