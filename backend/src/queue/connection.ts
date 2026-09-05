import IORedis, { Redis } from "ioredis";
import { env } from "../config/env";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on connections it manages,
 * and a *separate* ioredis instance per Queue/Worker/QueueEvents is the
 * documented best practice (sharing one instance across blocking + non
 * blocking commands causes hard-to-debug stalls).
 */
export function createRedisConnection(): Redis {
  return new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

// A single shared connection for simple, non-blocking use cases like the
// rate-limit counters and idempotency locks (not passed to BullMQ).
export const redis = createRedisConnection();
