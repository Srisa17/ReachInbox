import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import {
  verifyGoogleIdToken,
  findOrCreateUser,
  issueSessionToken,
} from "../services/authService";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../db/client";

export const authRouter = Router();

const GoogleLoginSchema = z.object({
  idToken: z.string().min(1),
});

/**
 * The frontend runs Google's own OAuth consent screen (via Google Identity
 * Services / NextAuth) and hands us the resulting ID token. We verify it
 * server-side, upsert the user, and hand back our own short session JWT as
 * an httpOnly cookie. No password or credential of ours is ever mocked —
 * the identity assertion itself comes straight from Google.
 */
authRouter.post("/google", async (req, res) => {
  const parsed = GoogleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "idToken is required" });
  }

  try {
    const profile = await verifyGoogleIdToken(parsed.data.idToken);
    const user = await findOrCreateUser(profile);
    const token = issueSessionToken({ userId: user.id, email: user.email });

    res.cookie("session", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res.status(401).json({ error: "Google authentication failed" });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const slack = await prisma.slackIntegration.findUnique({
    where: { userId: user.id },
  });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    slackConnected: Boolean(slack),
  });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});
