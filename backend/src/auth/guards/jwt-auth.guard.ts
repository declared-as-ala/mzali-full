import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AccessTokenClaims, EmployeeRole } from '@contracts';

export type RequestUser = { userId: string; role: EmployeeRole; name: string };

export interface AuthedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice(7));
      req.user = { userId: claims.sub, role: claims.role, name: claims.name };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
