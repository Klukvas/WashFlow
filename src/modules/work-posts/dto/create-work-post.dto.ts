import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

export class CreateWorkPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsUUID()
  branchId: string;
}
