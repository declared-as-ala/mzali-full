/**
 * Container HEALTHCHECK probe for the worker: verifies Mongo and Redis are
 * reachable with the worker's own configuration, then exits 0/1.
 * Kept dependency-light and fast (short timeouts).
 */
import { connect } from 'mongoose';
import Redis from 'ioredis';

async function probe(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  const redisUrl = process.env.REDIS_URL;
  if (!mongoUri || !redisUrl) throw new Error('Missing MONGODB_URI or REDIS_URL');

  const mongoose = await connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
  await mongoose.disconnect();

  const redis = new Redis(redisUrl, { connectTimeout: 4000, maxRetriesPerRequest: 1 });
  const pong = await redis.ping();
  redis.disconnect();
  if (pong !== 'PONG') throw new Error('Redis ping failed');
}

probe()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`worker probe failed: ${String(err)}`);
    process.exit(1);
  });
