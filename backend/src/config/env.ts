import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // --- Google OAuth (real login, no mock) ---
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_CALLBACK_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // --- Slack OAuth (real authorize flow) ---
  SLACK_CLIENT_ID: z.string().optional().default(""),
  SLACK_CLIENT_SECRET: z.string().optional().default(""),
  SLACK_REDIRECT_URI: z.string().optional().default(""),

  // --- Scheduling / throttling knobs (documented in README) ---
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  DEFAULT_MIN_DELAY_MS: z.coerce.number().default(2000),
  DEFAULT_MAX_EMAILS_PER_HOUR: z.coerce.number().default(100),

  // --- Elasticsearch ---
  ELASTICSEARCH_NODE: z.string().default("http://localhost:9200"),
  ELASTICSEARCH_INDEX: z.string().default("reachinbox_emails"),
  ELASTICSEARCH_DISABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud rather than limping along with undefined config.
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
