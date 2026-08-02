import { Connection, ClientSession } from 'mongoose';

/**
 * Run `fn` inside a MongoDB transaction (requires a replica-set deployment).
 * `withTransaction` retries on transient transaction errors per driver rules.
 */
export async function withTxn<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
