import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PosTerminalsService } from '../pos-terminals.service';

export interface PosRequest extends Request {
  posTerminalId?: string;
  posLocationId?: string;
}

/**
 * Validates the `X-POS-Terminal` + `X-POS-Fingerprint` headers against an
 * active, approved terminal record — applied alongside JwtAuthGuard on
 * every till-facing controller. See docs/pos-platform/security-model.md
 * §"POS terminal binding": the employee's JWT proves who is using the
 * till, this guard proves the till itself is an approved device.
 */
@Injectable()
export class PosTerminalGuard implements CanActivate {
  constructor(private readonly terminals: PosTerminalsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PosRequest>();
    const terminalCode = req.headers['x-pos-terminal'];
    const fingerprint = req.headers['x-pos-fingerprint'];
    if (typeof terminalCode !== 'string' || typeof fingerprint !== 'string' || !terminalCode || !fingerprint) {
      throw new UnauthorizedException('En-têtes de terminal manquants');
    }
    const appVersionHeader = req.headers['x-pos-app-version'];
    const appVersion = typeof appVersionHeader === 'string' ? appVersionHeader : null;
    const terminal = await this.terminals.validate(terminalCode, fingerprint, req.ip ?? null, appVersion);
    req.posTerminalId = terminal.id;
    req.posLocationId = terminal.locationId;
    return true;
  }
}
