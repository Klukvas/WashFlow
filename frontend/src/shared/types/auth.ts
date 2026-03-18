export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
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

export interface JwtPayload {
  sub: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  isSuperAdmin: boolean;
  permissions: string[];
  type: 'access' | 'refresh';
}
