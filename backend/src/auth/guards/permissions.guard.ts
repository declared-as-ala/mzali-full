import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, roleHasPermission } from '../permissions';
import type { AuthedRequest } from './jwt-auth.guard';

export const PERMISSIONS_KEY = 'required_permissions';

/** Every listed permission must be held by the caller's role. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException();

    for (const permission of required) {
      if (!roleHasPermission(user.role, permission)) {
        this.logger.warn({
          event: 'auth.permission_denied',
          userId: user.userId,
          role: user.role,
          permission,
          path: req.path,
        });
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }
    return true;
  }
}
