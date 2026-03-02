import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
      const expected = {
        accessToken: 'access-jwt',
        refreshToken: 'refresh-jwt',
      };

      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(expected);
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshTokens with verified payload when token is valid', async () => {
      const dto: RefreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      } as RefreshTokenDto;
      const refreshSecret = 'refresh-secret';
      const payload = {
        sub: 'user-uuid',
        type: 'refresh',
        tenantId: 'tenant-uuid',
      };
      const expected = {
        accessToken: 'new-access-jwt',
        refreshToken: 'new-refresh-jwt',
      };

      mockConfigService.get.mockReturnValue(refreshSecret);
      mockJwtService.verify.mockReturnValue(payload);
      mockAuthService.refreshTokens.mockResolvedValue(expected);

      const result = await controller.refresh(dto);

      expect(mockConfigService.get).toHaveBeenCalledWith('jwt.refreshSecret');
      expect(mockJwtService.verify).toHaveBeenCalledWith(dto.refreshToken, {
        secret: refreshSecret,
      });
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(payload);
      expect(result).toBe(expected);
    });

    it('throws UnauthorizedException when token type is not refresh', async () => {
      const dto: RefreshTokenDto = {
        refreshToken: 'access-token-used-as-refresh',
      } as RefreshTokenDto;

      mockConfigService.get.mockReturnValue('refresh-secret');
      mockJwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        type: 'access',
      });

      await expect(controller.refresh(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when jwtService.verify throws', async () => {
      const dto: RefreshTokenDto = {
        refreshToken: 'malformed-token',
      } as RefreshTokenDto;

      mockConfigService.get.mockReturnValue('refresh-secret');
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(controller.refresh(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });
});
