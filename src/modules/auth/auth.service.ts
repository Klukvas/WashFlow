import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { TRIAL_DEFAULTS } from '../subscriptions/trial.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<{ response: AuthResponseDto; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
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

  async register(
    dto: RegisterDto,
  ): Promise<{ response: AuthResponseDto; refreshToken: string }> {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const slug = await this.generateUniqueSlug(dto.companyName);
    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.companyName, slug },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          maxUsers: TRIAL_DEFAULTS.maxUsers,
          maxBranches: TRIAL_DEFAULTS.maxBranches,
          maxWorkPosts: TRIAL_DEFAULTS.maxWorkPosts,
          maxServices: TRIAL_DEFAULTS.maxServices,
          isTrial: true,
          trialEndsAt: new Date(
            Date.now() + TRIAL_DEFAULTS.durationDays * 24 * 60 * 60 * 1000,
          ),
        },
      });

      const allPermissions = await tx.permission.findMany();
      const adminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Admin',
          description: 'Full access administrator role',
          permissions: {
            create: allPermissions.map((p) => ({ permissionId: p.id })),
          },
        },
        include: {
          permissions: { include: { permission: true } },
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: true,
          isSuperAdmin: false,
          roleId: adminRole.id,
        },
      });

      const permissions = adminRole.permissions.map(
        (rp) => `${rp.permission.module}.${rp.permission.action}`,
      );

      return { user, permissions };
    });

    return this.generateTokens(result.user, result.permissions);
  }

  private async generateUniqueSlug(companyName: string): Promise<string> {
    const base = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const slug = base || 'company';

    const existing = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    if (!existing) return slug;

    // Append random suffix if slug is taken
    const suffix = Math.random().toString(36).slice(2, 7);
    return `${slug}-${suffix}`;
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
    // Increment tokenVersion to invalidate all existing refresh tokens
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });
  }

  async refreshTokens(
    payload: JwtPayload,
  ): Promise<{ response: AuthResponseDto; refreshToken: string }> {
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

    // Reject tokens issued before the last logout / password change
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const permissions =
      user.role?.permissions.map(
        (rp) => `${rp.permission.module}.${rp.permission.action}`,
      ) ?? [];

    return this.generateTokens(user, permissions);
  }

  /** Invalidate all refresh tokens by incrementing the token version. */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
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
      tokenVersion: number;
    },
    permissions: string[],
  ): { response: AuthResponseDto; refreshToken: string } {
    const basePayload = {
      sub: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId ?? null,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
      tokenVersion: user.tokenVersion,
    };

    const signOptions = (extra: JwtSignOptions): JwtSignOptions => extra;

    const accessToken = this.jwtService.sign(
      { ...basePayload, type: 'access' as const },
      signOptions({
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: (this.config.get<string>('jwt.accessExpiration') ??
          '15m') as any,
      }),
    );

    const refreshToken = this.jwtService.sign(
      { ...basePayload, type: 'refresh' as const },
      signOptions({
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: (this.config.get<string>('jwt.refreshExpiration') ??
          '7d') as any,
      }),
    );

    return {
      refreshToken,
      response: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          branchId: user.branchId ?? null,
          isSuperAdmin: user.isSuperAdmin,
        },
      },
    };
  }
}
