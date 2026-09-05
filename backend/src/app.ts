import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { sendersRouter } from "./routes/senders";
import { emailsRouter } from "./routes/emails";
import { slackRouter } from "./routes/slack";
import { searchRouter } from "./routes/search";
import { buildBullBoardRouter } from "./queue/bullBoard";

export function buildApp() {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/senders", sendersRouter);
  app.use("/api/emails", emailsRouter);
  app.use("/api/slack", slackRouter);
  app.use("/api/search", searchRouter);

  // Live BullMQ dashboard — real-time queue visibility requirement.
  app.use("/admin/queues", buildBullBoardRouter());

  return app;
}
