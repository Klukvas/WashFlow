import { IsArray, IsUUID } from 'class-validator';

export class AssignPermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
