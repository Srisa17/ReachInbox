const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  loginWithGoogle: (idToken: string) =>
    request<{ user: import("./types").AppUser }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),

  me: () =>
    request<{ user: import("./types").AppUser; slackConnected: boolean }>("/api/auth/me"),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  listSenders: () => request<{ senders: import("./types").Sender[] }>("/api/senders"),

  createSender: (label: string) =>
    request<{ sender: import("./types").Sender }>("/api/senders", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),

  parseLeads: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ count: number; emails: string[] }>("/api/emails/parse-leads", {
      method: "POST",
      body: form,
    });
  },

  scheduleCampaign: (payload: {
    senderId: string;
    subject: string;
    body: string;
    leads: string[];
    startTime: string;
    delayBetweenEmailsMs?: number;
    hourlyLimit?: number;
  }) =>
    request<{ campaignId: string; scheduled: number }>("/api/emails/schedule", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listScheduled: () =>
    request<{ emails: import("./types").ScheduledEmailItem[] }>("/api/emails/scheduled"),

  listSent: () => request<{ emails: import("./types").SentEmailItem[] }>("/api/emails/sent"),

  deleteScheduled: (id: string) => request<{ ok: true }>(`/api/emails/${id}`, { method: "DELETE" }),

  slackConnectUrl: () => `${API_BASE}/api/slack/connect`,

  slackDisconnect: () => request<{ ok: true }>("/api/slack/disconnect", { method: "POST" }),
};

export { API_BASE };
