import { IsEnum } from 'class-validator';

export class ChangePlanDto {
  @IsEnum(['STARTER', 'BUSINESS', 'ENTERPRISE'])
  planTier: 'STARTER' | 'BUSINESS' | 'ENTERPRISE';

  @IsEnum(['MONTHLY', 'YEARLY'])
  billingInterval: 'MONTHLY' | 'YEARLY';
}
