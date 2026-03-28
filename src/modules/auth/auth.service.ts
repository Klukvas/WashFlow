import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { EmailService } from '../email/email.service';
import {
  AuthLoginEvent,
  AuthLoginFailedEvent,
  AuthPasswordChangedEvent,
  AuthLogoutEvent,
  AuthAccountLockedEvent,
  AuthPasswordResetRequestedEvent,
} from '../../common/events/auth-events';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { TRIAL_DEFAULTS } from '../subscriptions/trial.constants';
import { PlanTier, SubscriptionStatus } from '../subscriptions/plan.constants';
import { Prisma } from '@prisma/client';

const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;

// Pre-computed dummy hash for constant-time login (prevents timing-based user enumeration)
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dummyhashvalue';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly emailService: EmailService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

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
      // Constant-time: perform a dummy argon2 verify to prevent timing-based user enumeration
      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => {});
      this.eventDispatcher.dispatch(
        new AuthLoginFailedEvent({
          email: dto.email,
          reason: 'Invalid credentials',
        }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lockout
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account is temporarily locked. Please try again later.',
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const lockoutData: {
        failedLoginAttempts: number;
        accountLockedUntil?: Date;
      } = {
        failedLoginAttempts: newAttempts,
      };

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutData.accountLockedUntil = new Date(
          Date.now() + LOCKOUT_DURATION_MS,
        );
        this.eventDispatcher.dispatch(
          new AuthAccountLockedEvent(user.tenantId, {
            userId: user.id,
            email: user.email,
            failedAttempts: newAttempts,
          }),
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: lockoutData,
      });

      this.eventDispatcher.dispatch(
        new AuthLoginFailedEvent({
          email: dto.email,
          reason: 'Invalid password',
        }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0 || user.accountLockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, accountLockedUntil: null },
      });
    }

    const permissions =
      user.role && !user.role.deletedAt
        ? user.role.permissions.map(
            (rp) => `${rp.permission.module}.${rp.permission.action}`,
          )
        : [];

    this.eventDispatcher.dispatch(
      new AuthLoginEvent(user.tenantId, { userId: user.id, email: user.email }),
    );

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

    const companyName = dto.companyName || dto.email.split('@')[0];
    const firstName = dto.firstName || '';
    const lastName = dto.lastName || '';

    const passwordHash = await argon2.hash(dto.password);

    let result: {
      user: Awaited<ReturnType<typeof this.prisma.user.create>>;
      permissions: string[];
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Generate slug inside the transaction to prevent race conditions
        const slug = await this.generateUniqueSlug(companyName, tx);
        const tenant = await tx.tenant.create({
          data: { name: companyName, slug },
        });

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planTier: PlanTier.TRIAL,
            status: SubscriptionStatus.TRIALING,
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
            firstName,
            lastName,
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
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('slug')
      ) {
        throw new ConflictException('Company name already taken');
      }
      throw error;
    }

    return this.generateTokens(
      result.user as Parameters<typeof this.generateTokens>[0],
      result.permissions,
    );
  }

  private async generateUniqueSlug(
    companyName: string,
    tx?: { tenant: { findUnique: typeof this.prisma.tenant.findUnique } },
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const base = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const slug = base || 'company';

    const existing = await client.tenant.findUnique({
      where: { slug },
    });
    if (!existing) return slug;

    // Append random suffix if slug is taken, verify it's also unique
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = crypto.randomBytes(4).toString('hex').slice(0, 5);
      const candidate = `${slug}-${suffix}`;
      const conflict = await client.tenant.findUnique({
        where: { slug: candidate },
      });
      if (!conflict) return candidate;
    }
    // Extremely unlikely — 5 random suffix collisions in a row
    throw new ConflictException(
      'Unable to generate a unique slug, please try a different company name',
    );
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

    const samePassword = await argon2.verify(
      user.passwordHash,
      dto.newPassword,
    );
    if (samePassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const newHash = await argon2.hash(dto.newPassword);
    // Increment tokenVersion to invalidate all existing refresh tokens
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });

    this.eventDispatcher.dispatch(
      new AuthPasswordChangedEvent(user.tenantId, {
        userId: user.id,
        email: user.email,
      }),
    );
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

    // If the user has a branchId, verify the branch still exists
    let branchId = user.branchId;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: user.tenantId },
      });
      if (!branch || branch.deletedAt) {
        // Branch was deleted — clear it so the new tokens omit the stale reference
        await this.prisma.user.update({
          where: { id: user.id },
          data: { branchId: null },
        });
        branchId = null;
      }
    }

    const permissions =
      user.role && !user.role.deletedAt
        ? user.role.permissions.map(
            (rp) => `${rp.permission.module}.${rp.permission.action}`,
          )
        : [];

    return this.generateTokens({ ...user, branchId }, permissions);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Silent return if user not found (prevents email enumeration)
    if (!user || !user.isActive || user.deletedAt) {
      return;
    }

    // Silent return if tenant is inactive or deleted (prevents enumeration)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });
    if (!tenant) {
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate all prior reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    });

    const frontendUrl = this.config.get<string>(
      'frontendUrl',
      'http://localhost:5173',
    );
    // Send the raw token to the user via email; only the hash is stored in DB
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.emailService.sendPasswordResetEmail(
      user.email,
      resetUrl,
      `${user.firstName} ${user.lastName}`,
    );

    this.eventDispatcher.dispatch(
      new AuthPasswordResetRequestedEvent({ email: user.email }),
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash: newHash,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
    });

    const user = await this.prisma.user.findUnique({
      where: { id: resetToken.userId },
    });

    if (user) {
      this.eventDispatcher.dispatch(
        new AuthPasswordChangedEvent(user.tenantId, {
          userId: user.id,
          email: user.email,
        }),
      );
    }
  }

  /** Invalidate all refresh tokens by incrementing the token version. */
  async logout(userId: string, tenantId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });

    this.eventDispatcher.dispatch(new AuthLogoutEvent(tenantId, { userId }));
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

    const accessToken = this.jwtService.sign(
      { ...basePayload, type: 'access' as const },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: (this.config.get<string>('jwt.accessExpiration') ??
          '15m') as StringValue,
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...basePayload, type: 'refresh' as const },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: (this.config.get<string>('jwt.refreshExpiration') ??
          '7d') as StringValue,
      },
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
