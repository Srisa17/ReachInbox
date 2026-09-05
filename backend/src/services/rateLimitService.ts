import { redis } from "../queue/connection";

/**
 * Rate limiting design
 * --------------------
 * Key shape:   ratelimit:sender:{senderId}:{YYYY-MM-DDTHH}
 * Value:       integer count of emails sent for that sender in that hour
 * TTL:         3600s (2x to survive clock skew doesn't matter — an expired
 *              key just means "0 sent this hour", which is correct)
 *
 * Why Redis and not an in-memory counter: multiple worker processes /
 * horizontally-scaled instances all pull jobs from the same BullMQ queue.
 * An in-memory counter would be per-process and would under-count,
 * blowing through the real limit. INCR in Redis is atomic, so concurrent
 * workers checking/incrementing the same sender's counter never race.
 *
 * We use a Lua script (EVAL) to make "check current count, and only
 * increment if under the limit" a single atomic operation — otherwise two
 * workers could both read count=99/100, both decide "ok to send", and
 * push the sender to 101.
 */

const RESERVE_SLOT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = tonumber(redis.call("GET", key) or "0")
if current >= limit then
  return 0
end

local new_val = redis.call("INCR", key)
if new_val == 1 then
  redis.call("EXPIRE", key, ttl)
end
return 1
`;

function hourWindowKey(senderId: string, date: Date = new Date()): string {
  const iso = date.toISOString(); // e.g. 2026-09-04T13:45:00.000Z
  const hourBucket = iso.slice(0, 13); // "2026-09-04T13"
  return `ratelimit:sender:${senderId}:${hourBucket}`;
}

/** Returns true and atomically reserves a send slot if the sender is under
 *  its hourly cap; returns false (and reserves nothing) if the cap is hit. */
export async function tryReserveSendSlot(
  senderId: string,
  maxPerHour: number
): Promise<boolean> {
  const key = hourWindowKey(senderId);
  const result = await redis.eval(RESERVE_SLOT_SCRIPT, 1, key, maxPerHour, 3600);
  return result === 1;
}

export async function getCurrentHourCount(senderId: string): Promise<number> {
  const key = hourWindowKey(senderId);
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

/** Start (in ms) of the *next* hour window, used to reschedule a job that
 *  got rate-limited so it lands as early as possible in the next window. */
export function nextHourWindowStart(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/**
 * Minimum delay between sends, per sender, enforced with a Redis key that
 * stores the timestamp of the last send. This is what keeps concurrent
 * workers (concurrency > 1) from all sending for the same sender back to
 * back — it is a *global* (cross-worker) throttle, not a per-process one.
 */
export async function waitForSenderThrottle(
  senderId: string,
  minDelayMs: number
): Promise<void> {
  if (minDelayMs <= 0) return;
  const key = `throttle:sender:${senderId}:last-sent`;

  // Loop with a short sleep until we can claim the throttle slot. This is
  // intentionally simple (polling) rather than a distributed lock queue,
  // which is a reasonable trade-off at the concurrency levels this
  // assignment targets (single digit to low double digit workers).
  for (;;) {
    const now = Date.now();
    const lastSent = await redis.get(key);
    const last = lastSent ? parseInt(lastSent, 10) : 0;
    const elapsed = now - last;

    if (elapsed >= minDelayMs) {
      // Try to atomically claim this slot by setting the timestamp only if
      // it hasn't moved since we read it (optimistic check via Lua would be
      // ideal at very high concurrency; SET here is good enough at the
      // scale this service targets and is documented as a trade-off).
      await redis.set(key, now.toString(), "PX", minDelayMs * 4);
      return;
    }

    await sleep(Math.min(250, minDelayMs - elapsed));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
