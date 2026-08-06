import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { TokenExpiredError } from 'jsonwebtoken';
import type { Request } from 'express';
import { Model } from 'mongoose';
import type { AccessTokenClaims, EmployeeRole } from '@contracts';
import { Employee } from '@/users/employee.schema';
import { Session } from '../session.schema';

export type RequestUser = { userId: string; role: EmployeeRole; name: string };

export interface AuthedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwt: JwtService,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      this.logger.debug({ event: 'auth.token_missing', path: req.path });
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice(7));
      if (!claims.sid) throw new UnauthorizedException('Invalid session');
      const [employee, session] = await Promise.all([
        this.employees.findById(claims.sub).select({ active: 1 }).lean(),
        this.sessions.findById(claims.sid).select({ userId: 1, expiresAt: 1, revokedAt: 1 }).lean(),
      ]);
      if (!employee?.active) {
        this.logger.warn({ event: 'auth.employee_disabled', userId: claims.sub, path: req.path });
        throw new UnauthorizedException('Employee disabled');
      }
      if (!session || String(session.userId) !== claims.sub || session.revokedAt || session.expiresAt < new Date()) {
        this.logger.debug({ event: 'auth.session_revoked', userId: claims.sub, path: req.path });
        throw new UnauthorizedException('Session revoked');
      }
      req.user = { userId: claims.sub, role: claims.role, name: claims.name };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const expired = err instanceof TokenExpiredError;
      this.logger.debug({
        event: expired ? 'auth.token_expired' : 'auth.token_invalid',
        path: req.path,
      });
      throw new UnauthorizedException(expired ? 'Access token expired' : 'Invalid or expired token');
    }
  }
}
