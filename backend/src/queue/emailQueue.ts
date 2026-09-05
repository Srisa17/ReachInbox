import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "./connection";

export const EMAIL_QUEUE_NAME = "email-send-queue";

// Queue: the durable list of delayed jobs. BullMQ persists everything
// (job data, delay, state) in Redis, so a server restart never loses a
// scheduled job — the worker just resumes consuming from where it left off.
export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7 }, // keep 7 days for the dashboard/audit trail
    removeOnFail: false,
  },
});

// QueueEvents: lets the API process react to job lifecycle events (e.g. to
// update the DB row's status) without living inside the worker process.
export const emailQueueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
});

export interface EmailJobData {
  scheduledEmailId: string;
  senderId: string;
  toEmail: string;
  subject: string;
  body: string;
}

/**
 * Enqueue (or re-enqueue) a job for a scheduled email.
 *
 * Idempotency: we always pass `jobId = scheduledEmailId`. BullMQ treats
 * jobId as a unique key inside the queue — calling `add` again with the
 * same id is a no-op if the job already exists (docs: "jobId ... will
 * override the default and can be used to run job only once."). That is
 * what stops the same email from ever being scheduled twice, even if the
 * API route is retried or the reconciliation job runs after a restart.
 */
export async function enqueueEmailJob(
  data: EmailJobData,
  runAt: Date
): Promise<string> {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  const job = await emailQueue.add("send-email", data, {
    jobId: data.scheduledEmailId,
    delay,
  });
  return job.id as string;
}

export async function removeEmailJob(scheduledEmailId: string): Promise<void> {
  const job = await emailQueue.getJob(scheduledEmailId);
  if (job) {
    await job.remove();
  }
}
