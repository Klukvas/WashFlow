import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateWorkPostDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  branchId: string;
}
