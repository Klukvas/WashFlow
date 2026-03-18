import {
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  MaxLength,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ValidateIf((o: UpdateOrderStatusDto) => o.status === 'CANCELLED')
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationReason?: string;
}
