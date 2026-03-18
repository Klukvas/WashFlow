import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const mockAuthService = {
  login: jest.fn(),
  register: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  changePassword: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

function makeMockRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('delegates to authService.login with the login dto', async () => {
      const dto: LoginDto = {
        email: 'user@example.com',
        password: 'secret',
      } as LoginDto;
      const responseData = { accessToken: 'access-jwt', user: {} };
      const refreshToken = 'refresh-jwt';

      mockAuthService.login.mockResolvedValue({
        response: responseData,
        refreshToken,
      });
      mockConfigService.get.mockReturnValue('test');

      const res = makeMockRes();
      const result = await controller.login(dto, res as any);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(responseData);
    });

    it('sets the refresh token cookie on login', async () => {
      const dto: LoginDto = {
        email: 'user@example.com',
        password: 'secret',
      } as LoginDto;

      mockAuthService.login.mockResolvedValue({
        response: { accessToken: 'access-jwt', user: {} },
        refreshToken: 'refresh-jwt',
      });
      mockConfigService.get.mockReturnValue('test');

      const res = makeMockRes();
      await controller.login(dto, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-jwt',
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'Secret1!',
      firstName: 'John',
      lastName: 'Doe',
      companyName: 'Acme Corp',
    } as RegisterDto;

    it('delegates to authService.register with the register dto', async () => {
      const responseData = { accessToken: 'access-jwt', user: {} };
      const refreshToken = 'refresh-jwt';

      mockAuthService.register.mockResolvedValue({
        response: responseData,
        refreshToken,
      });
      mockConfigService.get.mockReturnValue('test');

      const res = makeMockRes();
      const result = await controller.register(dto, res as any);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(result).toBe(responseData);
    });

    it('sets the refresh token cookie after registration', async () => {
      const refreshToken = 'new-refresh-jwt';

      mockAuthService.register.mockResolvedValue({
        response: { accessToken: 'access-jwt', user: {} },
        refreshToken,
      });
      mockConfigService.get.mockReturnValue('test');

      const res = makeMockRes();
      await controller.register(dto, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        refreshToken,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('sets a secure cookie in production environment', async () => {
      mockAuthService.register.mockResolvedValue({
        response: { accessToken: 'access-jwt', user: {} },
        refreshToken: 'refresh-jwt',
      });
      mockConfigService.get.mockReturnValue('production');

      const res = makeMockRes();
      await controller.register(dto, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-jwt',
        expect.objectContaining({ secure: true }),
      );
    });

    it('sets a non-secure cookie outside production', async () => {
      mockAuthService.register.mockResolvedValue({
        response: { accessToken: 'access-jwt', user: {} },
        refreshToken: 'refresh-jwt',
      });
      mockConfigService.get.mockReturnValue('development');

      const res = makeMockRes();
      await controller.register(dto, res as any);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-jwt',
        expect.objectContaining({ secure: false }),
      );
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshTokens with verified payload when token is valid', async () => {
      const refreshSecret = 'refresh-secret';
      const payload = {
        sub: 'user-uuid',
        type: 'refresh',
        tenantId: 'tenant-uuid',
      };
      const responseData = { accessToken: 'new-access-jwt', user: {} };

      mockConfigService.get.mockReturnValue(refreshSecret);
      mockJwtService.verify.mockReturnValue(payload);
      mockAuthService.refreshTokens.mockResolvedValue({
        response: responseData,
        refreshToken: 'new-refresh-jwt',
      });

      const req = { cookies: { refresh_token: 'valid-refresh-token' } };
      const res = makeMockRes();
      const result = await controller.refresh(req as any, res as any);

      expect(mockConfigService.get).toHaveBeenCalledWith('jwt.refreshSecret');
      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'valid-refresh-token',
        { secret: refreshSecret },
      );
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(payload);
      expect(result).toBe(responseData);
    });

    it('throws UnauthorizedException when no refresh token cookie is present', async () => {
      const req = { cookies: {} };
      const res = makeMockRes();

      await expect(
        controller.refresh(req as any, res as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when token type is not refresh', async () => {
      mockConfigService.get.mockReturnValue('refresh-secret');
      mockJwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        type: 'access',
      });

      const req = { cookies: { refresh_token: 'access-token-used-as-refresh' } };
      const res = makeMockRes();

      await expect(
        controller.refresh(req as any, res as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when jwtService.verify throws', async () => {
      mockConfigService.get.mockReturnValue('refresh-secret');
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      const req = { cookies: { refresh_token: 'malformed-token' } };
      const res = makeMockRes();

      await expect(
        controller.refresh(req as any, res as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('delegates to authService.logout with userId and tenantId from the JWT', async () => {
      const userId = 'user-uuid';
      const tenantId = 'tenant-uuid';

      mockAuthService.logout.mockResolvedValue(undefined);

      const res = makeMockRes();
      await controller.logout(userId, tenantId, res as any);

      expect(mockAuthService.logout).toHaveBeenCalledWith(userId, tenantId);
    });

    it('clears the refresh_token cookie with the correct path on logout', async () => {
      const userId = 'user-uuid';
      const tenantId = 'tenant-uuid';

      mockAuthService.logout.mockResolvedValue(undefined);

      const res = makeMockRes();
      await controller.logout(userId, tenantId, res as any);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        { path: '/api/v1/auth' },
      );
    });

    it('clears the cookie even when authService.logout resolves with no value', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const res = makeMockRes();
      await controller.logout('user-uuid', 'tenant-uuid', res as any);

      expect(res.clearCookie).toHaveBeenCalledTimes(1);
    });
  });

  describe('changePassword', () => {
    const dto: ChangePasswordDto = {
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass2@',
    } as ChangePasswordDto;

    it('delegates to authService.changePassword with userId from @CurrentUser and the dto', async () => {
      const userId = 'user-uuid';
      mockAuthService.changePassword.mockResolvedValue(undefined);

      await controller.changePassword(userId, dto);

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(userId, dto);
    });

    it('returns the result from authService.changePassword', async () => {
      const userId = 'user-uuid';
      const serviceResult = { success: true };
      mockAuthService.changePassword.mockResolvedValue(serviceResult);

      const result = await controller.changePassword(userId, dto);

      expect(result).toBe(serviceResult);
    });

    it('propagates errors thrown by authService.changePassword', async () => {
      const userId = 'user-uuid';
      mockAuthService.changePassword.mockRejectedValue(
        new UnauthorizedException('Current password is incorrect'),
      );

      await expect(controller.changePassword(userId, dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('forgotPassword', () => {
    const dto: ForgotPasswordDto = {
      email: 'user@example.com',
    } as ForgotPasswordDto;

    it('delegates to authService.forgotPassword with the dto', async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);

      await controller.forgotPassword(dto);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    });

    it('returns a generic message regardless of whether the email exists', async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);

      const result = await controller.forgotPassword(dto);

      expect(result).toEqual({
        message: 'If the email exists, a reset link has been sent',
      });
    });

    it('returns the same generic message even when authService resolves with a value', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ sent: true });

      const result = await controller.forgotPassword(dto);

      expect(result).toEqual({
        message: 'If the email exists, a reset link has been sent',
      });
    });
  });

  describe('resetPassword', () => {
    const dto: ResetPasswordDto = {
      token: 'valid-reset-token',
      newPassword: 'NewPass2@',
    } as ResetPasswordDto;

    it('delegates to authService.resetPassword with the dto', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);

      await controller.resetPassword(dto);

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    });

    it('returns a success message after resetting the password', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword(dto);

      expect(result).toEqual({
        message: 'Password has been reset successfully',
      });
    });

    it('propagates errors thrown by authService.resetPassword', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new UnauthorizedException('Invalid or expired reset token'),
      );

      await expect(controller.resetPassword(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
