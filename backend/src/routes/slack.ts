import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/requireAuth";
import { buildSlackAuthorizeUrl, completeSlackOAuth, disconnectSlack } from "../services/slackService";
import { verifySessionToken } from "../services/authService";
import { env } from "../config/env";

export const slackRouter = Router();

/**
 * Step 1: "Connect Slack" button in the dashboard hits this, which
 * redirects the browser to Slack's real OAuth consent screen. We fold the
 * user's session token into `state` (verified on callback) rather than
 * relying on the callback's request having our auth cookie, since Slack's
 * redirect is a top-level navigation that still carries first-party
 * cookies here, but encoding it explicitly makes the flow robust either way.
 */
slackRouter.get("/connect", requireAuth, (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("slack_oauth_state", state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.cookie("slack_oauth_user", req.userId!, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.redirect(buildSlackAuthorizeUrl(state));
});

/** Step 2: Slack redirects back here with `code` + our `state`. */
slackRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const expectedState = req.cookies?.slack_oauth_state;
  const userId = req.cookies?.slack_oauth_user;

  if (error) {
    return res.redirect(`${env.FRONTEND_URL}/dashboard?slack=denied`);
  }
  if (!code || !state || state !== expectedState || !userId) {
    return res.redirect(`${env.FRONTEND_URL}/dashboard?slack=invalid_state`);
  }

  try {
    await completeSlackOAuth(userId, code);
    res.clearCookie("slack_oauth_state");
    res.clearCookie("slack_oauth_user");
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    console.error("Slack OAuth callback failed:", err);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
  }
});

slackRouter.post("/disconnect", requireAuth, async (req, res) => {
  await disconnectSlack(req.userId!);
  res.json({ ok: true });
});

// Re-export for use in places that only have a raw cookie, not the full
// requireAuth middleware chain (kept here to avoid a circular import).
export function decodeSessionCookie(token: string) {
  return verifySessionToken(token);
}
