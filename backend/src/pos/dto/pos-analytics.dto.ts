import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const TZ = 'Africa/Tunis';
// Fixed at UTC+1 with no DST since 2005 — safe to hardcode rather than
// deriving it per-call.
const TUNIS_UTC_OFFSET_MS = 60 * 60_000;

export type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

/** Resolves a date preset (or explicit from/to) into a concrete UTC range,
 *  anchored to the Africa/Tunis calendar day — matches the timezone
 *  convention used by StatsService's `$dateToString` bucketing. */
export function resolveDateRange(preset: DatePreset | undefined, from?: string, to?: string): { from: Date; to: Date } {
  if (preset === 'custom' || (!preset && (from || to))) {
    if (!from || !to) throw new Error('from et to sont requis pour une période personnalisée');
    return { from: new Date(from), to: new Date(to) };
  }

  const nowTunis = tunisNow();
  const startOfTodayTunis = new Date(Date.UTC(nowTunis.getUTCFullYear(), nowTunis.getUTCMonth(), nowTunis.getUTCDate()));
  const tzOffsetMs = TUNIS_UTC_OFFSET_MS;

  const startOfDay = (daysAgo: number) => new Date(startOfTodayTunis.getTime() - daysAgo * 86_400_000 - tzOffsetMs);
  const endOfDay = (d: Date) => new Date(d.getTime() + 86_400_000 - 1);

  switch (preset ?? 'today') {
    case 'today':
      return { from: startOfDay(0), to: new Date(Date.now()) };
    case 'yesterday':
      return { from: startOfDay(1), to: endOfDay(startOfDay(1)) };
    case 'last7':
      return { from: startOfDay(6), to: new Date(Date.now()) };
    case 'last30':
      return { from: startOfDay(29), to: new Date(Date.now()) };
    case 'thisMonth': {
      const start = new Date(Date.UTC(nowTunis.getUTCFullYear(), nowTunis.getUTCMonth(), 1) - tzOffsetMs);
      return { from: start, to: new Date(Date.now()) };
    }
    case 'lastMonth': {
      const start = new Date(Date.UTC(nowTunis.getUTCFullYear(), nowTunis.getUTCMonth() - 1, 1) - tzOffsetMs);
      const end = new Date(Date.UTC(nowTunis.getUTCFullYear(), nowTunis.getUTCMonth(), 1) - tzOffsetMs - 1);
      return { from: start, to: end };
    }
    default:
      return { from: startOfDay(0), to: new Date(Date.now()) };
  }
}

function tunisNow(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
}

export class PosAnalyticsFilterDto {
  @IsOptional() @IsIn(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'custom'])
  preset?: DatePreset;

  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;

  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() terminalId?: string;
  @IsOptional() @IsString() registerId?: string;
  @IsOptional() @IsString() cashierId?: string;
}

export class RevenueSeriesQueryDto extends PosAnalyticsFilterDto {
  @IsOptional() @IsIn(['hour', 'day', 'week', 'month'])
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export class ProductPerformanceQueryDto extends PosAnalyticsFilterDto {
  @IsOptional() @IsIn(['pos', 'online', 'all']) channel?: 'pos' | 'online' | 'all';
  @IsOptional() @IsIn(['qty', 'revenue', 'profit', 'margin', 'growth']) sort?: 'qty' | 'revenue' | 'profit' | 'margin' | 'growth';
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class CategoryPerformanceQueryDto extends PosAnalyticsFilterDto {
  @IsOptional() @IsIn(['pos', 'online', 'all']) channel?: 'pos' | 'online' | 'all';
}

export class ExportReportQueryDto extends PosAnalyticsFilterDto {
  @IsIn(['kpis', 'revenue-series', 'cashiers', 'products', 'categories', 'payment-breakdown'])
  report!: 'kpis' | 'revenue-series' | 'cashiers' | 'products' | 'categories' | 'payment-breakdown';

  @IsIn(['csv', 'xlsx', 'pdf'])
  format!: 'csv' | 'xlsx' | 'pdf';
}
