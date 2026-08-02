import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '@/jobs/queues';
import { CarrierName, ShippingService } from './shipping.service';

export type CarrierPushJob = { carrier: CarrierName; orderId: string };

/** Worker-only: consumes auto-push jobs enqueued by OrdersService on order creation/confirmation. */
@Processor(QUEUES.CARRIER_PUSH)
export class CarrierPushProcessor extends WorkerHost {
  private readonly logger = new Logger(CarrierPushProcessor.name);

  constructor(private readonly shipping: ShippingService) {
    super();
  }

  async process(job: Job<CarrierPushJob>): Promise<void> {
    const { carrier, orderId } = job.data;
    const { skipped, result } = await this.shipping.push(carrier, orderId, {
      type: 'system',
      id: null,
      name: 'auto-push',
    });
    if (!skipped && !result.ok) {
      this.logger.warn(`Auto-push ${carrier} failed for order ${orderId}: ${result.error}`);
    }
  }
}
