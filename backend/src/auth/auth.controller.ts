import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '@/audit/audit.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto/auth.dto';
import { JwtAuthGuard, RequestUser } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] ?? null };
    try {
      const result = await this.auth.login(dto.username, dto.password, meta);
      await this.audit.log({
        actor: { type: 'employee', id: result.user.id, name: result.user.name },
        action: 'auth.login',
        entityType: 'session',
        summary: `Connexion de ${result.user.name}`,
        ip: req.ip,
      });
      return result;
    } catch (err) {
      await this.audit.log({
        actor: { type: 'system', id: null, name: 'auth' },
        action: 'auth.login_failed',
        entityType: 'session',
        summary: `Échec de connexion pour "${dto.username}"`,
        ip: req.ip,
      });
      throw err;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logoutAll(@CurrentUser() user: RequestUser, @Req() req: Request) {
    const revoked = await this.auth.logoutAll(user.userId);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'auth.logout_all',
      entityType: 'session',
      summary: `Déconnexion de toutes les sessions (${revoked})`,
      ip: req.ip,
    });
    return { ok: true, revoked };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: RequestUser) {
    const record = await this.auth.getAuthUser(user.userId);
    if (!record) throw new NotFoundException();
    return record;
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'auth.password_change',
      entityType: 'employee',
      entityId: user.userId,
      summary: `Changement de mot de passe`,
      ip: req.ip,
    });
    return { ok: true };
  }
}
