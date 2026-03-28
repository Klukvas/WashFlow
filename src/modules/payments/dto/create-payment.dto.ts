import {
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Payment amount', example: 29.99 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({
    description: 'Payment method',
    enum: ['CASH', 'CARD', 'TRANSFER', 'ONLINE'],
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({ description: 'Payment reference' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({
    description: 'Payment status',
    enum: ['PENDING', 'PAID'],
  })
  @IsOptional()
  @IsEnum(
    { PENDING: 'PENDING', PAID: 'PAID' },
    { message: 'status must be PENDING or PAID' },
  )
  status?: 'PENDING' | 'PAID';
}
