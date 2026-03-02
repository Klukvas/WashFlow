export interface LoginRequest {
  tenantId: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  branchId: string | null;
  isSuperAdmin: boolean;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  isSuperAdmin: boolean;
  permissions: string[];
  type: 'access' | 'refresh';
}
