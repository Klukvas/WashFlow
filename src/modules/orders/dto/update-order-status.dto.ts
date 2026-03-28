import {
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateIf,
  MaxLength,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ValidateIf((o: UpdateOrderStatusDto) => o.status === 'CANCELLED')
  @IsNotEmpty({
    message: 'Cancellation reason is required when cancelling an order',
  })
  @IsString()
  @MaxLength(1000)
  cancellationReason?: string;
}
