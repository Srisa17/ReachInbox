import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../db/client";
import { parseLeadsFile } from "../utils/parseLeads";
import { scheduleBulkEmails } from "../queue/scheduler";
import { removeEmailJob } from "../queue/emailQueue";
import { EmailStatus } from "@prisma/client";

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Step 1 of compose: upload the CSV/text lead list and get back a parsed
 * count, without committing to a schedule yet (matches the Figma flow of
 * "upload -> show N addresses detected -> then hit Schedule").
 */
emailsRouter.post("/parse-leads", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const emails = parseLeadsFile(req.file.buffer, req.file.originalname);
  res.json({ count: emails.length, emails });
});

const ScheduleSchema = z.object({
  senderId: z.string().uuid(),
  subject: z.string().min(1),
  body: z.string().min(1),
  leads: z.array(z.string().email()).min(1),
  startTime: z.coerce.date(),
  delayBetweenEmailsMs: z.number().int().nonnegative().optional(),
  hourlyLimit: z.number().int().positive().optional(),
});

/**
 * Schedules a full campaign: one ScheduledEmail row + one BullMQ delayed
 * job per lead, spaced out from `startTime` using `delayBetweenEmailsMs`
 * as a *scheduling* spacing hint (the worker also independently enforces
 * the sender's minDelayMs at send time — see rateLimitService).
 */
emailsRouter.post("/schedule", async (req, res) => {
  const parsed = ScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  const sender = await prisma.sender.findFirst({
    where: { id: data.senderId, userId: req.userId },
  });
  if (!sender) return res.status(404).json({ error: "Sender not found" });

  if (data.hourlyLimit) {
    await prisma.sender.update({
      where: { id: sender.id },
      data: { maxEmailsPerHour: data.hourlyLimit },
    });
  }
  const effectiveDelayMs = data.delayBetweenEmailsMs ?? sender.minDelayMs;
  if (data.delayBetweenEmailsMs) {
    await prisma.sender.update({
      where: { id: sender.id },
      data: { minDelayMs: data.delayBetweenEmailsMs },
    });
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: req.userId!,
      subject: data.subject,
      body: data.body,
    },
  });

  const inputs = data.leads.map((toEmail, i) => ({
    userId: req.userId!,
    campaignId: campaign.id,
    senderId: sender.id,
    toEmail,
    subject: data.subject,
    body: data.body,
    // Spread scheduled times out by the configured delay so 1000+ leads
    // scheduled "for the same time" still land as a smooth, ordered
    // stream of delayed jobs rather than a thundering herd at t=0 — the
    // hourly rate limiter is the second line of defense on top of this.
    scheduledFor: new Date(data.startTime.getTime() + i * effectiveDelayMs),
  }));

  const result = await scheduleBulkEmails(inputs);
  res.status(201).json({ campaignId: campaign.id, ...result });
});

emailsRouter.get("/scheduled", async (req, res) => {
  const emails = await prisma.scheduledEmail.findMany({
    where: {
      userId: req.userId,
      status: { in: [EmailStatus.PENDING, EmailStatus.QUEUED, EmailStatus.RESCHEDULED] },
    },
    orderBy: { scheduledFor: "asc" },
    include: { sender: { select: { label: true, etherealEmail: true } } },
  });
  res.json({ emails });
});

emailsRouter.get("/sent", async (req, res) => {
  const emails = await prisma.scheduledEmail.findMany({
    where: {
      userId: req.userId,
      status: { in: [EmailStatus.SENT, EmailStatus.FAILED] },
    },
    orderBy: { sentAt: "desc" },
    include: { sender: { select: { label: true, etherealEmail: true } } },
  });
  res.json({ emails });
});

emailsRouter.delete("/:id", async (req, res) => {
  const email = await prisma.scheduledEmail.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!email) return res.status(404).json({ error: "Not found" });

  await removeEmailJob(email.id);
  await prisma.scheduledEmail.delete({ where: { id: email.id } });
  res.json({ ok: true });
});
