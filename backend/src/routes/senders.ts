import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../db/client";
import { createEtherealAccount } from "../services/mailerService";
import { env } from "../config/env";

export const sendersRouter = Router();
sendersRouter.use(requireAuth);

const CreateSenderSchema = z.object({
  label: z.string().min(1),
  maxEmailsPerHour: z.number().int().positive().optional(),
  minDelayMs: z.number().int().nonnegative().optional(),
});

sendersRouter.get("/", async (req, res) => {
  const senders = await prisma.sender.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      etherealEmail: true,
      maxEmailsPerHour: true,
      minDelayMs: true,
      createdAt: true,
    },
  });
  res.json({ senders });
});

sendersRouter.post("/", async (req, res) => {
  const parsed = CreateSenderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const creds = await createEtherealAccount();

  const sender = await prisma.sender.create({
    data: {
      userId: req.userId!,
      label: parsed.data.label,
      etherealEmail: creds.etherealEmail,
      etherealPass: creds.etherealPass,
      etherealSmtpHost: creds.etherealSmtpHost,
      etherealSmtpPort: creds.etherealSmtpPort,
      maxEmailsPerHour: parsed.data.maxEmailsPerHour ?? env.DEFAULT_MAX_EMAILS_PER_HOUR,
      minDelayMs: parsed.data.minDelayMs ?? env.DEFAULT_MIN_DELAY_MS,
    },
  });

  res.status(201).json({
    sender: {
      id: sender.id,
      label: sender.label,
      etherealEmail: sender.etherealEmail,
      maxEmailsPerHour: sender.maxEmailsPerHour,
      minDelayMs: sender.minDelayMs,
    },
  });
});
