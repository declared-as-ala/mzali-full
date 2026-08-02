import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest, RequestUser } from './guards/jwt-auth.guard';

/** Injects the authenticated user attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new Error('CurrentUser used without JwtAuthGuard');
    return req.user;
  },
);
