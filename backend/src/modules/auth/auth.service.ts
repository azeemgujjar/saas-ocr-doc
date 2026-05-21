import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { UserRole, UserStatus, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { AuthResponseDto, AuthTokenDto } from './dto/auth-response.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Creates the tenant and its first user in one transaction.
  // That first user is the OWNER.
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictException('Tenant slug already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          status: TenantStatus.ACTIVE,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          fullName: dto.fullName ?? null,
          role: UserRole.OWNER,
          status: UserStatus.ACTIVE,
        },
      });
      return { tenant, user };
    });

    this.logger.log(`Registered tenant=${tenant.slug} owner=${user.email}`);

    const tokens = await this.issueTokens(user.id, tenant.id, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
      tokens,
    };
  }

  // Login is scoped to a tenant — the same email can exist in more than one
  // tenant, so the slug is part of the credential.
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    // Generic error message to avoid leaking which part is wrong
    const invalid = () => new UnauthorizedException('Invalid credentials');
    if (!tenant || tenant.status !== TenantStatus.ACTIVE) throw invalid();

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email.toLowerCase() } },
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw invalid();

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) throw invalid();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, tenant.id, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
      tokens,
    };
  }

  // TODO: refresh tokens are stateless here. Production needs server-side
  // storage so they can be rotated on use and revoked on logout.
  async refresh(dto: RefreshDto): Promise<AuthTokenDto> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tenantId: string;
        role: string;
      }>(dto.refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      return this.issueTokens(payload.sub, payload.tenantId, payload.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<AuthTokenDto> {
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    const payload = { sub: userId, tenantId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiresIn as JwtSignOptions['expiresIn'],
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: parseExpiresInToSeconds(accessExpiresIn),
      tokenType: 'Bearer',
    };
  }
}

function parseExpiresInToSeconds(input: string): number {
  const m = /^(\d+)([smhd])$/.exec(input);
  if (!m) return 900;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return 900;
  }
}
