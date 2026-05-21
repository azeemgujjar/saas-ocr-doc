import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthContext } from '../../../common/types/authenticated-request';

interface JwtPayload {
  sub: string;        // userId
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') as string,
    });
  }

  // Runs after signature/expiry checks. Re-checks the user and tenant are
  // still active so a suspended user's existing token stops working at once.
  async validate(payload: JwtPayload): Promise<AuthContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User no longer active');
    }
    if (user.tenantId !== payload.tenantId) {
      // Token tampering attempt
      throw new UnauthorizedException('Token tenant mismatch');
    }
    if (user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tenant is not active');
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      authMethod: 'jwt',
    };
  }
}
