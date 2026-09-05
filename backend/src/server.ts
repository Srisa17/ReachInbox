import "dotenv/config";
import { buildApp } from "./app";
import { env } from "./config/env";
import { reconcileScheduledEmailsOnBoot } from "./queue/scheduler";

async function main() {
  // Restart-safety: re-attach any DB rows that lost their BullMQ job (see
  // scheduler.ts for why this is safe and idempotent to run every boot).
  await reconcileScheduledEmailsOnBoot();

  const app = buildApp();
  app.listen(env.PORT, () => {
    console.log(`🚀 ReachInbox scheduler API listening on :${env.PORT}`);
    console.log(`   Bull-Board dashboard: http://localhost:${env.PORT}/admin/queues`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
