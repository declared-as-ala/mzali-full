import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenExpiredError } from 'jsonwebtoken';
import type { Request } from 'express';
import type { AccessTokenClaims, EmployeeRole } from '@contracts';

export type RequestUser = { userId: string; role: EmployeeRole; name: string };

export interface AuthedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      this.logger.debug({ event: 'auth.token_missing', path: req.path });
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice(7));
      req.user = { userId: claims.sub, role: claims.role, name: claims.name };
      return true;
    } catch (err) {
      const expired = err instanceof TokenExpiredError;
      this.logger.debug({
        event: expired ? 'auth.token_expired' : 'auth.token_invalid',
        path: req.path,
      });
      throw new UnauthorizedException(expired ? 'Access token expired' : 'Invalid or expired token');
    }
  }
}
