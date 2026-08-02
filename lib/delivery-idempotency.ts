const deliveryLocks = new Map<string, Promise<void>>();

export async function withDeliveryLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = deliveryLocks.get(key);
  if (previous) await previous.catch(() => {});

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  deliveryLocks.set(key, current);

  try {
    return await task();
  } finally {
    release();
    if (deliveryLocks.get(key) === current) {
      deliveryLocks.delete(key);
    }
  }
}

export function alreadySentResponse(barcode: string) {
  return {
    ok: true,
    skipped: true,
    barcode,
    error: null,
    raw: { skipped: true, reason: 'already_sent' },
  };
}
