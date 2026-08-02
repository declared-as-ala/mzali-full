/** Central queue-name registry — the only queues this platform uses. */
export const QUEUES = {
  MEDIA_PROCESSING: 'media-processing',
  WOO_MIGRATION: 'woocommerce-migration',
  CARRIER_PUSH: 'carrier-push',
  CLEANUP: 'cleanup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
