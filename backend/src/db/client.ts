import { PrismaClient } from "@prisma/client";

// Standard "singleton in dev" pattern so `tsx watch` restarts don't open a
// new pool of Postgres connections on every reload.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
