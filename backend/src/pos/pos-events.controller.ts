import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosEventsService } from './pos-events.service';

/**
 * Note: consumed via fetch() + a ReadableStream reader on the POS
 * frontend, not the browser's native EventSource — EventSource can't send
 * the custom X-POS-Terminal/X-POS-Fingerprint/Authorization headers every
 * other POS endpoint requires. Same guard stack as pos/catalog.
 */
@ApiTags('pos/events')
@ApiBearerAuth()
@Controller('pos/events')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosEventsController {
  constructor(private readonly events: PosEventsService) {}

  @Sse()
  @RequirePermissions('pos.sell')
  stream(): Observable<MessageEvent> {
    return this.events.stream().pipe(map((event) => ({ data: event })));
  }
}
