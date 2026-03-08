import { IsInt, Min, Max } from 'class-validator';

export class UpsertSubscriptionDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  maxUsers: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  maxBranches: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  maxWorkPosts: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  maxServices: number;
}
