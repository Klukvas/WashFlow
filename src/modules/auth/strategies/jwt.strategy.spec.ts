import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../common/types/jwt-payload.type';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService;
    strategy = new JwtStrategy(config);
  });

  it('should return the payload when token type is "access"', () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      type: 'access',
      isSuperAdmin: false,
      permissions: [],
    };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('should throw UnauthorizedException when token type is "refresh"', () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      type: 'refresh',
      isSuperAdmin: false,
      permissions: [],
    };
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException with correct message for wrong token type', () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      type: 'refresh',
      isSuperAdmin: false,
      permissions: [],
    };
    expect(() => strategy.validate(payload)).toThrow('Invalid token type');
  });
});
