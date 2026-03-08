export interface JwtPayload {
  sub: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  isSuperAdmin: boolean;
  permissions: string[];
  tokenVersion: number;
  type: 'access' | 'refresh';
}
