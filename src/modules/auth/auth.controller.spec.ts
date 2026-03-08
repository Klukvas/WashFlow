import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const mockAuthService = {
  login: jest.fn(),
  refreshTokens: jest.fn(),
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
});
