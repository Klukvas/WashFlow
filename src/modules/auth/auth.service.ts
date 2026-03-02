import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from '../../common/types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        tenantId: dto.tenantId,
        email: dto.email,
        deletedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const permissions =
      user.role?.permissions.map(
        (rp) => `${rp.permission.module}.${rp.permission.action}`,
      ) ?? [];

    return this.generateTokens(user, permissions);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const currentValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!currentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
  }

  async refreshTokens(payload: JwtPayload): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('User no longer active');
    }

    const permissions =
      user.role?.permissions.map(
        (rp) => `${rp.permission.module}.${rp.permission.action}`,
      ) ?? [];

    return this.generateTokens(user, permissions);
  }

  private generateTokens(
    user: {
      id: string;
      tenantId: string;
      branchId: string | null;
      email: string;
      firstName: string;
      lastName: string;
      isSuperAdmin: boolean;
    },
    permissions: string[],
  ): AuthResponseDto {
    const basePayload = {
      sub: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId ?? null,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
    };

    const accessToken = this.jwtService.sign(
      { ...basePayload, type: 'access' as const },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get('jwt.accessExpiration') ?? '15m',
      } as any,
    );

    const refreshToken = this.jwtService.sign(
      { ...basePayload, type: 'refresh' as const },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiration') ?? '7d',
      } as any,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        branchId: user.branchId ?? null,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }
}
