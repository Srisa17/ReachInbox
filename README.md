# ReachInbox — Email Job Scheduler

A production-shaped slice of ReachInbox's outbound infrastructure: schedule
cold-email campaigns, send them through Ethereal SMTP on time, survive
restarts, respect per-sender throughput limits, and get a live Slack ping
the moment a sender hits its cap.

```
reachinbox/
├── backend/     Express + TypeScript API, BullMQ worker, Prisma/Postgres
├── frontend/    Next.js + TypeScript + Tailwind dashboard
└── docker-compose.yml   Postgres + Redis + Elasticsearch for local dev
```

## Quick start

```bash
# 1. Infra
docker compose up -d          # postgres:5432, redis:6379, elasticsearch:9200

# 2. Backend
cd backend
cp .env.example .env          # fill in Google + Slack OAuth credentials
npm install
npm run prisma:migrate        # creates tables
npm run dev                   # API on :4000
npm run worker                # run in a second terminal — the BullMQ worker

# 3. Frontend
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev                   # dashboard on :3000
```

Open `http://localhost:3000`, sign in with Google, and use "Compose new
email" to schedule a campaign. The live queue can be inspected at
`http://localhost:4000/admin/queues` (Bull-Board).

### OAuth setup

- **Google**: create an OAuth 2.0 Client ID at the [Google Cloud
  Console](https://console.cloud.google.com/apis/credentials), authorized
  redirect URI `http://localhost:3000/api/auth/callback/google`. Put the
  client id/secret in both `backend/.env` and `frontend/.env.local`.
- **Slack**: create an app at [api.slack.com/apps](https://api.slack.com/apps),
  add the `incoming-webhook` and `chat:write` scopes, and set the OAuth
  redirect URL to `http://localhost:4000/api/slack/callback`.

## Why these pieces fit together the way they do

### Scheduling, not cron

Every scheduled email is a **BullMQ delayed job** (`emailQueue.add(..., {
delay })`), backed by Redis. There is no OS cron, no `node-cron`, and no
polling loop guessing when to fire something — BullMQ's own delayed-job
mechanism (a Redis sorted set keyed by run time) handles that, and it
survives process restarts because the job lives in Redis, not in the
Node process's memory.

### Idempotency & restart safety

The Postgres `ScheduledEmail` row and its BullMQ job share the same id
(`jobId = scheduledEmailId`). That single fact does most of the
heavy-lifting for the two hard constraints in the brief:

- **No duplicate sends**: BullMQ refuses to create a second job with a
  jobId that already exists, so re-running the schedule endpoint (or a
  network retry) can never double-enqueue the same email. The worker also
  checks the DB row's status before sending, as a second guard against a
  stalled job being reprocessed.
- **Restart durability**: Redis is run with AOF persistence
  (`docker-compose.yml`), so the common case — restart the API/worker
  process — loses nothing; BullMQ just reconnects and resumes. For the
  uncommon case where Redis itself loses its data (e.g. a fresh volume),
  `reconcileScheduledEmailsOnBoot()` runs on every server boot, finds any
  `QUEUED`/`RESCHEDULED` row **without** a live BullMQ job, and
  re-enqueues it using the same jobId — safe to run every time because of
  the de-dupe behavior above.

### Throughput: concurrency, delay, and the hourly cap

- **Concurrency**: `WORKER_CONCURRENCY` (env var) sets how many jobs the
  BullMQ `Worker` processes in parallel. Default: `5`.
- **Minimum delay between sends**: `DEFAULT_MIN_DELAY_MS` (default
  **2000ms**), enforced per-sender in `rateLimitService.waitForSenderThrottle`.
  It's a Redis-backed "last sent at" timestamp, not an in-memory sleep, so
  it holds even with concurrency > 1 or multiple worker processes — two
  workers racing to send for the *same* sender still end up spaced apart.
- **Emails per hour**: `MAX_EMAILS_PER_HOUR` is configurable per sender
  (`Sender.maxEmailsPerHour`, defaulting to `DEFAULT_MAX_EMAILS_PER_HOUR`).
  Enforcement is a Redis key `ratelimit:sender:{id}:{YYYY-MM-DDTHH}`
  incremented via a **Lua script** (`EVAL`) so "check under limit, then
  increment" is one atomic operation — this is what stops concurrent
  workers from both reading "99/100" and both deciding to send, which a
  plain `GET` + `INCR` pair would allow.
- **When the cap is hit**: the job is **not failed or dropped**. The
  worker calls BullMQ's `job.moveToDelayed()` to push the *same* job
  (same id, same data) to the start of the next hour window, and updates
  the DB row's status to `RESCHEDULED`. Because it's the same job moving,
  not a new one, ordering across the rest of the queue is preserved as
  much as BullMQ's delayed-set ordering allows.

### Slack notification

"Connect Slack" performs a real `oauth.v2.access` token exchange (
`services/slackService.ts`) and stores the resulting bot token + incoming
webhook URL per user. When a sender's hourly cap is hit, the worker calls
`notifyRateLimitHit()`, which looks the integration up **fresh** (no
caching) and POSTs to the webhook — so if the user hasn't connected yet
it silently no-ops, and the moment they do connect, the very next
rate-limit hit notifies them with no redeploy.

### 1000+ emails scheduled for "the same time"

The schedule endpoint spreads a campaign's recipients out starting at
`startTime`, one `delayBetweenEmailsMs` apart, before they ever reach the
queue — so "1000 emails at 2:00pm" becomes 1000 delayed jobs landing
2 seconds apart by default, not a burst. The hourly rate limiter is the
second line of defense on top of that: if the spread-out schedule still
exceeds a sender's hourly budget, the overflow reschedules into the next
window automatically, per the point above.

### Search

Every create/status-transition indexes the email into Elasticsearch
(`services/searchService.ts`) with `subject`/`body`/`toEmail` as
searchable text fields. Indexing is deliberately best-effort: if
Elasticsearch is unreachable, indexing/searching no-ops rather than
breaking the send path (set `ELASTICSEARCH_DISABLED=true` to run without
it entirely).

## Known trade-offs

- The per-sender min-delay throttle uses a short poll loop against a
  Redis key rather than a distributed lock/queue — simple and correct at
  the concurrency levels this assignment targets, but would want a proper
  token-bucket implementation (e.g. `rate-limiter-flexible`) at much
  higher scale.
- Bulk scheduling inserts rows sequentially to keep insertion order ==
  send order; for very large lead lists this could be batched with
  `createMany` + `Promise.all` chunks if insert latency became a
  bottleneck.
- Bull-Board is mounted without its own auth wrapper for the assignment
  demo; in production it should sit behind the same session check as the
  rest of the API.
