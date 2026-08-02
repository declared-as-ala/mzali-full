import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Guards the storefront-facing endpoints. Only the Next server (BFF) holds
 * this token; the API is never called directly by browsers.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const presented = req.headers['x-service-token'];
    if (typeof presented !== 'string' || presented.length === 0) {
      throw new UnauthorizedException();
    }
    const expected = this.config.getOrThrow<string>('SERVICE_TOKEN');
    // Compare fixed-length digests to avoid length leaks
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
