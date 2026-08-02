import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { normalizePhone } from '@/common/phone';
import { RedisLockService } from '@/redis/redis-lock.service';
import { SettingsService } from '@/settings/settings.service';
import { Employee } from '@/users/employee.schema';
import { Customer } from '@/customers/customer.schema';

const STICKY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ROUND_ROBIN_SETTINGS_KEY = 'orderAssignmentRoundRobin';

/**
 * Order auto-assignment — ported from lib/round-robin.ts +
 * services/woo/woo-order-service.ts:pickEmployeeForOrder.
 * 1. Sticky customer: same active employee within 30 days.
 * 2. Round-robin over active employees, Redis-locked, pointer persisted
 *    in the `settings` collection (replaces the old file lock).
 */
@Injectable()
export class AssignmentService {
  constructor(
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    private readonly lock: RedisLockService,
    private readonly settings: SettingsService,
  ) {}

  async pickEmployee(phone: string, session?: ClientSession): Promise<string | null> {
    const activeEmployees = await this.employees
      .find({ role: 'employee', active: true })
      .sort({ createdAt: 1 })
      .session(session ?? null);
    if (activeEmployees.length === 0) return null;
    const activeIds = new Set(activeEmployees.map((e) => e.id));

    const sticky = await this.findSticky(phone, activeIds, session);
    if (sticky) return sticky;

    return this.pickRoundRobin(activeEmployees.map((e) => e.id));
  }

  private async findSticky(phone: string, activeIds: Set<string>, session?: ClientSession): Promise<string | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const customer = await this.customers.findOne({ phone: normalized }).session(session ?? null);
    if (!customer?.lastAssignment?.employeeId || !customer.lastAssignment.at) return null;
    if (!activeIds.has(customer.lastAssignment.employeeId)) return null;
    const age = Date.now() - customer.lastAssignment.at.getTime();
    if (age > STICKY_WINDOW_MS) return null;
    return customer.lastAssignment.employeeId;
  }

  private async pickRoundRobin(activeIds: string[]): Promise<string | null> {
    if (activeIds.length === 0) return null;
    const release = await this.lock.acquire('order-assignment:round-robin', 5000);
    if (!release) return activeIds[0]; // lock contention fallback — still deterministic
    try {
      const pointer = await this.readPointer();
      const idx = pointer.nextIndex % activeIds.length;
      const selected = activeIds[idx];
      await this.writePointer({ nextIndex: (pointer.nextIndex + 1) % activeIds.length });
      return selected;
    } finally {
      await release();
    }
  }

  private async readPointer(): Promise<{ nextIndex: number }> {
    const raw = await this.settings.getRaw(ROUND_ROBIN_SETTINGS_KEY);
    const nextIndex = typeof raw?.nextIndex === 'number' ? raw.nextIndex : 0;
    return { nextIndex };
  }

  private async writePointer(state: { nextIndex: number }): Promise<void> {
    await this.settings.setRaw(ROUND_ROBIN_SETTINGS_KEY, state);
  }
}
