import { prisma } from "../db/client";
import { enqueueEmailJob, emailQueue } from "./emailQueue";
import { indexEmail } from "../services/searchService";
import { EmailStatus } from "@prisma/client";

export interface ScheduleEmailInput {
  userId: string;
  campaignId: string;
  senderId: string;
  toEmail: string;
  subject: string;
  body: string;
  scheduledFor: Date;
}

/**
 * Creates the DB row first (source of truth), then enqueues the BullMQ
 * delayed job using the row's own id as the BullMQ jobId. That ordering,
 * plus the shared id, is what makes scheduling idempotent end-to-end:
 * DB row exists  <=>  a BullMQ job for it exists (or has already run).
 */
export async function scheduleEmail(input: ScheduleEmailInput) {
  const email = await prisma.scheduledEmail.create({
    data: {
      userId: input.userId,
      campaignId: input.campaignId,
      senderId: input.senderId,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      scheduledFor: input.scheduledFor,
      status: EmailStatus.QUEUED,
    },
  });

  const jobId = await enqueueEmailJob(
    {
      scheduledEmailId: email.id,
      senderId: input.senderId,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
    },
    input.scheduledFor
  );

  await prisma.scheduledEmail.update({
    where: { id: email.id },
    data: { bullJobId: jobId },
  });

  await indexEmail({
    id: email.id,
    userId: email.userId,
    senderId: email.senderId,
    toEmail: email.toEmail,
    subject: email.subject,
    body: email.body,
    status: EmailStatus.QUEUED,
    scheduledFor: email.scheduledFor,
    sentAt: null,
  });

  return email;
}

export async function scheduleBulkEmails(
  inputs: ScheduleEmailInput[]
): Promise<{ scheduled: number }> {
  // Sequential on purpose: BullMQ + Postgres both handle this volume fine,
  // and going sequential keeps insertion order == send order, which matters
  // for "preserve order as much as possible" once rate limiting reshuffles
  // things into later hour windows.
  for (const input of inputs) {
    await scheduleEmail(input);
  }
  return { scheduled: inputs.length };
}

/**
 * Restart-safety net.
 *
 * BullMQ jobs live in Redis, and Redis is normally persisted (AOF/RDB), so
 * in the common case a server restart loses nothing: the Queue simply
 * reconnects and the Worker keeps consuming the same delayed jobs.
 *
 * This function covers the *uncommon* case — Redis data was wiped (e.g. a
 * fresh Redis container with no volume) while Postgres, the source of
 * truth, still has rows marked QUEUED with no corresponding job. On boot,
 * we look for exactly that mismatch and re-enqueue using the same
 * `scheduledEmailId` as jobId, so if the job actually *does* still exist
 * in Redis, BullMQ's jobId de-dupe makes this a safe no-op instead of a
 * duplicate send.
 */
export async function reconcileScheduledEmailsOnBoot(): Promise<void> {
  const pending = await prisma.scheduledEmail.findMany({
    where: { status: { in: [EmailStatus.QUEUED, EmailStatus.RESCHEDULED] } },
  });

  let reconciled = 0;

  for (const row of pending) {
    const existingJob = row.bullJobId
      ? await emailQueue.getJob(row.bullJobId)
      : null;

    if (existingJob) continue; // job is alive in Redis — nothing to do

    // Job is missing from Redis but the DB still says it's pending: this is
    // exactly the "restart lost the queue" scenario. Re-create it.
    const runAt = row.scheduledFor > new Date() ? row.scheduledFor : new Date();
    const jobId = await enqueueEmailJob(
      {
        scheduledEmailId: row.id,
        senderId: row.senderId,
        toEmail: row.toEmail,
        subject: row.subject,
        body: row.body,
      },
      runAt
    );

    await prisma.scheduledEmail.update({
      where: { id: row.id },
      data: { bullJobId: jobId },
    });

    reconciled += 1;
  }

  if (reconciled > 0) {
    console.log(`[reconcile] Re-enqueued ${reconciled} job(s) lost from Redis.`);
  } else {
    console.log("[reconcile] All pending emails already have live jobs. Nothing to do.");
  }
}
