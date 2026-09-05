import { env } from "../config/env";
import { prisma } from "../db/client";

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access";

/** Scopes needed to post the rate-limit alert via an incoming webhook. */
const SLACK_SCOPES = ["incoming-webhook", "chat:write"].join(",");

export function buildSlackAuthorizeUrl(state: string): string {
  const url = new URL(SLACK_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.SLACK_CLIENT_ID);
  url.searchParams.set("scope", SLACK_SCOPES);
  url.searchParams.set("redirect_uri", env.SLACK_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token: string;
  team: { id: string; name: string };
  incoming_webhook?: { channel: string; url: string };
}

/**
 * Exchanges the temporary `code` Slack redirected back with for a real bot
 * token + incoming webhook URL, then persists it against the user. This is
 * the real OAuth token exchange (Slack's `oauth.v2.access` endpoint) — no
 * mock tokens.
 */
export async function completeSlackOAuth(userId: string, code: string) {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });

  const res = await fetch(SLACK_OAUTH_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = (await res.json()) as SlackOAuthAccessResponse;

  if (!data.ok || !data.incoming_webhook) {
    throw new Error(`Slack OAuth failed: ${data.error ?? "unknown error"}`);
  }

  return prisma.slackIntegration.upsert({
    where: { userId },
    create: {
      userId,
      teamId: data.team.id,
      teamName: data.team.name,
      botAccessToken: data.access_token,
      incomingWebhookUrl: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
    },
    update: {
      teamId: data.team.id,
      teamName: data.team.name,
      botAccessToken: data.access_token,
      incomingWebhookUrl: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
    },
  });
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackIntegration.deleteMany({ where: { userId } });
}

/**
 * Fires a live Slack message the moment a sender's hourly cap is hit.
 *
 * Handles the "not connected" case by design, not as an afterthought: if
 * no SlackIntegration row exists for this user we simply return — no
 * crash, no retry storm, no notification. As soon as the user connects
 * Slack (an upsert into the same table), this same code path starts
 * delivering notifications with zero redeploy, because we look the
 * integration up fresh on every rate-limit hit rather than caching it.
 */
export async function notifyRateLimitHit(params: {
  userId: string;
  senderLabel: string;
  senderEmail: string;
  limit: number;
  rescheduledFor: Date;
}): Promise<void> {
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId: params.userId },
  });

  if (!integration) return; // not connected — silently skip, per spec

  const text =
    `:rotating_light: *Hourly send limit reached* for sender ` +
    `*${params.senderLabel}* (${params.senderEmail}).\n` +
    `Limit: ${params.limit}/hour. Remaining emails have been rescheduled ` +
    `to start at ${params.rescheduledFor.toISOString()}.`;

  try {
    await fetch(integration.incomingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    // A failed Slack notification must never fail the email job itself.
    console.error("Slack notification failed:", err);
  }
}
