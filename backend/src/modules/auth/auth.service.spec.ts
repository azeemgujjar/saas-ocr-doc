import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Demonstrates how the auth service is tested with mocked Prisma.
 * In a real codebase you'd add many more cases (locked accounts,
 * suspended tenants, refresh-token rotation, etc.).
 */
describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtMock: any;
  let configMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
    };
    jwtMock = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    configMock = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'jwt.accessSecret': 'access-secret',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.accessExpiresIn': '15m',
          'jwt.refreshExpiresIn': '7d',
        };
        return values[key] ?? def;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when slug already exists', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', slug: 'taken' });

      await expect(
        service.register({
          tenantName: 'X',
          tenantSlug: 'taken',
          email: 'a@b.com',
          password: 'password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates tenant and owner user', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);
      prismaMock.tenant.create.mockResolvedValue({ id: 't1', slug: 'acme' });
      prismaMock.user.create.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        fullName: null,
        role: 'OWNER',
      });

      const result = await service.register({
        tenantName: 'Acme',
        tenantSlug: 'acme',
        email: 'a@b.com',
        password: 'password',
      });

      expect(result.user.email).toBe('a@b.com');
      expect(result.tokens.accessToken).toBe('signed-token');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for bad credentials (consistent message)', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', slug: 'acme', status: 'ACTIVE' });
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ tenantSlug: 'acme', email: 'x@y.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens for correct credentials', async () => {
      const passwordHash = await bcrypt.hash('correct', 4);
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', slug: 'acme', status: 'ACTIVE' });
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        email: 'a@b.com',
        passwordHash,
        fullName: 'A',
        role: 'OWNER',
        status: 'ACTIVE',
      });
      prismaMock.user.update.mockResolvedValue({});

      const result = await service.login({
        tenantSlug: 'acme',
        email: 'a@b.com',
        password: 'correct',
      });
      expect(result.tokens.accessToken).toBeDefined();
    });
  });
});
