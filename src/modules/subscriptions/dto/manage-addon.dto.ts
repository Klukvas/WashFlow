import { IsEnum, IsInt, Min, Max } from 'class-validator';

export class ManageAddonDto {
  @IsEnum(['branches', 'workPosts', 'users', 'services'])
  resource: 'branches' | 'workPosts' | 'users' | 'services';

  @IsInt()
  @Min(0)
  @Max(100)
  quantity: number;
}
