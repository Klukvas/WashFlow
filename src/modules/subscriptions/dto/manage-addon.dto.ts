import { IsEnum, IsInt, Min } from 'class-validator';

export class ManageAddonDto {
  @IsEnum(['branches', 'workPosts', 'users', 'services'])
  resource: 'branches' | 'workPosts' | 'users' | 'services';

  @IsInt()
  @Min(0)
  quantity: number;
}
