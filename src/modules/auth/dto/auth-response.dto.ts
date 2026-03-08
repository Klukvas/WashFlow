export class AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  branchId: string | null;
  isSuperAdmin: boolean;
}

export class AuthResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
