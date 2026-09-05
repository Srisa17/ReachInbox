import "dotenv/config";
import { Worker, Job, DelayedError } from "bullmq";
import { EmailStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/client";
import { createRedisConnection } from "./connection";
import { EMAIL_QUEUE_NAME, EmailJobData } from "./emailQueue";
import {
  tryReserveSendSlot,
  nextHourWindowStart,
  waitForSenderThrottle,
} from "../services/rateLimitService";
import { sendEmailViaEthereal } from "../services/mailerService";
import { notifyRateLimitHit } from "../services/slackService";
import { indexEmail } from "../services/searchService";

/**
 * Processor for a single scheduled email.
 *
 * Order of operations matters here:
 *   1. Reserve an hourly slot for the sender (atomic Redis check+incr).
 *      If the cap is hit, DO NOT fail the job — move it to the next hour
 *      window instead (see `moveJobToNextWindow`) and notify Slack.
 *   2. Enforce the minimum inter-send delay for that sender, so multiple
 *      concurrent workers don't burst sends for the same sender.
 *   3. Actually send via Ethereal, then update Postgres + the search index.
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, senderId, toEmail, subject, body } = job.data;

  const sender = await prisma.sender.findUnique({ where: { id: senderId } });
  if (!sender) {
    throw new Error(`Sender ${senderId} no longer exists`);
  }

  const emailRow = await prisma.scheduledEmail.findUnique({
    where: { id: scheduledEmailId },
  });
  if (!emailRow) {
    // Row was deleted (e.g. user cancelled it) — quietly drop the job.
    return;
  }
  if (emailRow.status === EmailStatus.SENT) {
    // Idempotency guard: if this job is somehow processed twice (e.g. a
    // stalled job got requeued by BullMQ's stall detector after actually
    // completing), never send the same email twice.
    return;
  }

  const maxPerHour = sender.maxEmailsPerHour || env.DEFAULT_MAX_EMAILS_PER_HOUR;
  const gotSlot = await tryReserveSendSlot(senderId, maxPerHour);

  if (!gotSlot) {
    await moveJobToNextWindow(job, sender, emailRow.id);
    return;
  }

  await waitForSenderThrottle(senderId, sender.minDelayMs || env.DEFAULT_MIN_DELAY_MS);

  try {
    await sendEmailViaEthereal({
      senderId: sender.id,
      credentials: {
        etherealEmail: sender.etherealEmail,
        etherealPass: sender.etherealPass,
        etherealSmtpHost: sender.etherealSmtpHost,
        etherealSmtpPort: sender.etherealSmtpPort,
      },
      to: toEmail,
      subject,
      html: body,
    });

    const updated = await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    await indexEmail({
      id: updated.id,
      userId: updated.userId,
      senderId: updated.senderId,
      toEmail: updated.toEmail,
      subject: updated.subject,
      body: updated.body,
      status: updated.status,
      scheduledFor: updated.scheduledFor,
      sentAt: updated.sentAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: EmailStatus.FAILED,
        errorMessage: message,
        attempts: { increment: 1 },
      },
    });
    throw err; // let BullMQ's retry/backoff policy handle re-attempts
  }
}

/**
 * Rate-limit-hit path: reschedule (never drop) the job into the next hour
 * window and fire a live Slack alert. Uses BullMQ's `moveToDelayed`, which
 * keeps the SAME job (same jobId, same data) rather than creating a new
 * one — that's what keeps this idempotent and keeps the job's position in
 * BullMQ's internal ordering as close to "next in line" as possible.
 */
async function moveJobToNextWindow(
  job: Job<EmailJobData>,
  sender: { id: string; label: string; etherealEmail: string; maxEmailsPerHour: number; userId: string },
  scheduledEmailId: string
): Promise<void> {
  const nextWindow = nextHourWindowStart();

  await job.moveToDelayed(nextWindow.getTime(), job.token);

  await prisma.scheduledEmail.update({
    where: { id: scheduledEmailId },
    data: {
      status: EmailStatus.RESCHEDULED,
      scheduledFor: nextWindow,
      rescheduleCount: { increment: 1 },
    },
  });

  await notifyRateLimitHit({
    userId: sender.userId,
    senderLabel: sender.label,
    senderEmail: sender.etherealEmail,
    limit: sender.maxEmailsPerHour,
    rescheduledFor: nextWindow,
  });

  // Throwing DelayedError tells BullMQ this job has been moved out of the
  // active state on purpose, so it doesn't also mark it failed/completed.
  throw new DelayedError();
}

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedisConnection(),
    // Configurable worker concurrency (requirement: "Configure your BullMQ
    // worker(s) with a configurable concurrency level").
    concurrency: env.WORKER_CONCURRENCY,
  });

  worker.on("completed", (job) => {
    console.log(`[worker] sent email job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// Allow running this file standalone: `npm run worker`
if (require.main === module) {
  console.log(
    `[worker] starting with concurrency=${env.WORKER_CONCURRENCY}, ` +
      `default min delay=${env.DEFAULT_MIN_DELAY_MS}ms, ` +
      `default max/hour=${env.DEFAULT_MAX_EMAILS_PER_HOUR}`
  );
  startEmailWorker();
}
