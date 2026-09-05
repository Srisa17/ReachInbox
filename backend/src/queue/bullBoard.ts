import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "./emailQueue";

/**
 * Live, real-time view into the BullMQ queue (requirement: "Expose a live
 * BullMQ dashboard for real-time queue visibility"). Mounted at /admin/queues
 * by app.ts. No auth wrapper here for the assignment demo; in production
 * this route should sit behind the same session auth as the rest of the API.
 */
export function buildBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
