import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import type { AccessTokenClaims, AuthUser, LoginResult, RefreshResult } from '@contracts';
import { Employee, EmployeeDocument } from '@/users/employee.schema';
import { Session } from './session.schema';
import { hashPassword, needsRehash, verifyPassword } from './password';

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;
/** Username the legacy console uses for the primary admin account. */
const LEGACY_ADMIN_USERNAME = 'admin';

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      const existingEmployee = await this.employees.findOne({ email: 'employe@mzali.com' });
      if (!existingEmployee) {
        const hash = await hashPassword('Password123!');
        await this.employees.create({
          email: 'employe@mzali.com',
          name: 'Employé Test',
          role: 'employee',
          active: true,
          passwordHash: hash,
          failedLoginAttempts: 0,
        });
        this.logger.log('Compte employé de test créé: employe@mzali.com / Password123!');
      }
    } catch {
      // Ignored during database bootstrap
    }
  }

  /**
   * `identifier` is either the literal "admin" (legacy console username for
   * the migrated super_admin) or an employee email.
   */
  async login(identifier: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const normalized = identifier.trim().toLowerCase();
    // "admin" doesn't map to a fixed email (the migrated super_admin's actual
    // address varies with the source store) — resolve it to whichever
    // account actually holds the super_admin role instead of guessing.
    const employee =
      normalized === LEGACY_ADMIN_USERNAME
        ? await this.employees.findOne({ role: 'super_admin' }).sort({ createdAt: 1 })
        : await this.employees.findOne({ email: normalized });
    // Uniform error for unknown account / bad password / inactive account
    const reject = () => new UnauthorizedException('Identifiants invalides');

    if (!employee) throw reject();
    if (!employee.active) throw new ForbiddenException('Compte désactivé');
    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      throw new ForbiddenException('Compte temporairement verrouillé. Réessayez plus tard.');
    }

    const ok = await verifyPassword(employee.passwordHash, password);
    if (!ok) {
      await this.registerFailedAttempt(employee);
      throw reject();
    }

    // Transparent upgrade of migrated scrypt hashes to Argon2id
    if (needsRehash(employee.passwordHash)) {
      employee.passwordHash = await hashPassword(password);
    }
    employee.failedLoginAttempts = 0;
    employee.lockedUntil = null;
    employee.lastLoginAt = new Date();
    await employee.save();

    const tokens = await this.issueTokens(employee, randomUUID(), meta);
    return { ...tokens, user: this.toAuthUser(employee) };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<RefreshResult> {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.sessions.findOne({ refreshTokenHash: tokenHash });
    if (!session) throw new UnauthorizedException('Session invalide');

    // Reuse of a rotated/revoked token ⇒ assume theft, kill the family.
    if (session.revokedAt || session.replacedByHash) {
      await this.sessions.updateMany(
        { familyId: session.familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      this.logger.warn(`Refresh token reuse detected for user ${session.userId} — family revoked`);
      throw new UnauthorizedException('Session invalide');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Session expirée');

    const employee = await this.employees.findById(session.userId);
    if (!employee || !employee.active) throw new UnauthorizedException('Session invalide');

    const tokens = await this.issueTokens(employee, session.familyId, meta);
    session.revokedAt = new Date();
    session.replacedByHash = this.hashToken(tokens.refreshToken);
    await session.save();
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.sessions.updateOne(
      { refreshTokenHash: tokenHash, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  async logoutAll(userId: string): Promise<number> {
    const res = await this.sessions.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return res.modifiedCount;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const employee = await this.employees.findById(userId);
    if (!employee) throw new UnauthorizedException();
    const ok = await verifyPassword(employee.passwordHash, currentPassword);
    if (!ok) throw new UnauthorizedException('Mot de passe actuel incorrect');
    employee.passwordHash = await hashPassword(newPassword);
    employee.mustChangePassword = false;
    await employee.save();
    // A password change invalidates every other session.
    await this.logoutAll(userId);
  }

  async getAuthUser(userId: string): Promise<AuthUser | null> {
    const employee = await this.employees.findById(userId);
    return employee ? this.toAuthUser(employee) : null;
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    return this.jwt.verify<AccessTokenClaims>(token);
  }

  private async issueTokens(
    employee: EmployeeDocument,
    familyId: string,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const expiresIn = this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
    const claims: AccessTokenClaims = {
      sub: employee.id,
      role: employee.role,
      name: employee.name,
    };
    const accessToken = await this.jwt.signAsync(claims, { expiresIn });

    const refreshToken = randomBytes(48).toString('hex');
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    await this.sessions.create({
      userId: employee._id,
      refreshTokenHash: this.hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return { accessToken, refreshToken, expiresIn };
  }

  private async registerFailedAttempt(employee: EmployeeDocument): Promise<void> {
    employee.failedLoginAttempts += 1;
    if (employee.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      employee.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      employee.failedLoginAttempts = 0;
      this.logger.warn(`Account locked after repeated failures: ${employee.email}`);
    }
    await employee.save();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthUser(employee: EmployeeDocument): AuthUser {
    return {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      role: employee.role,
      mustChangePassword: employee.mustChangePassword,
    };
  }
}
