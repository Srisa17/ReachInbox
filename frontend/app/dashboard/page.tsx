"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AppUser, ScheduledEmailItem, SentEmailItem } from "@/lib/types";
import { Header } from "@/components/Header";
import { ScheduledTable } from "@/components/ScheduledTable";
import { SentTable } from "@/components/SentTable";
import { ComposeModal } from "@/components/ComposeModal";
import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/Button";

type Tab = "scheduled" | "sent";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [slackConnected, setSlackConnected] = useState(false);

  const [tab, setTab] = useState<Tab>("scheduled");
  const [scheduled, setScheduled] = useState<ScheduledEmailItem[]>([]);
  const [sent, setSent] = useState<SentEmailItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  // Establish the backend session cookie from the Google ID token that
  // NextAuth obtained, then load "me". This runs once the NextAuth session
  // is available.
  useEffect(() => {
    async function bootstrap() {
      if (status === "unauthenticated") {
        router.replace("/");
        return;
      }
      if (status !== "authenticated") return;

      const idToken = (session as any)?.googleIdToken as string | undefined;
      try {
        if (idToken) {
          await api.loginWithGoogle(idToken);
        }
        const me = await api.me();
        setUser(me.user);
        setSlackConnected(me.slackConnected);
      } catch {
        router.replace("/");
        return;
      } finally {
        setAuthReady(true);
      }
    }
    bootstrap();
  }, [status, session, router]);

  const refreshLists = useCallback(async () => {
    setLoadingList(true);
    try {
      const [s, sn] = await Promise.all([api.listScheduled(), api.listSent()]);
      setScheduled(s.emails);
      setSent(sn.emails);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (authReady) refreshLists();
  }, [authReady, refreshLists]);

  async function handleCancel(id: string) {
    await api.deleteScheduled(id);
    refreshLists();
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Signing you in…" />
      </div>
    );
  }

  if (!user) return null;

  const slackParam = searchParams.get("slack");

  return (
    <div className="min-h-screen">
      <Header user={user} onComposeClick={() => setComposeOpen(true)} />

      <main className="max-w-6xl mx-auto px-8 py-8">
        {slackParam === "connected" && (
          <Banner tone="success">Slack connected. Rate-limit alerts will post there.</Banner>
        )}
        {slackParam === "error" && <Banner tone="error">Slack connection failed. Try again.</Banner>}

        <SlackConnectRow connected={slackConnected} onChange={setSlackConnected} />

        <div className="flex items-center gap-6 border-b border-ink-700 mb-6">
          <TabButton active={tab === "scheduled"} onClick={() => setTab("scheduled")}>
            Scheduled emails
            <Count value={scheduled.length} />
          </TabButton>
          <TabButton active={tab === "sent"} onClick={() => setTab("sent")}>
            Sent emails
            <Count value={sent.length} />
          </TabButton>
        </div>

        {tab === "scheduled" ? (
          <ScheduledTable emails={scheduled} loading={loadingList} onCancel={handleCancel} />
        ) : (
          <SentTable emails={sent} loading={loadingList} />
        )}
      </main>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onScheduled={() => {
            setComposeOpen(false);
            refreshLists();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm flex items-center gap-2 border-b-2 -mb-px transition-colors ${
        active ? "border-amber-400 text-paper" : "border-transparent text-slate-400 hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ value }: { value: number }) {
  return <span className="text-xs text-slate-400">{value}</span>;
}

function Banner({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-md px-4 py-3 text-sm mb-6 ${
        tone === "success" ? "bg-teal-400/10 text-teal-400" : "bg-rose-400/10 text-rose-400"
      }`}
    >
      {children}
    </div>
  );
}

function SlackConnectRow({
  connected,
  onChange,
}: {
  connected: boolean;
  onChange: (v: boolean) => void;
}) {
  async function disconnect() {
    await api.slackDisconnect();
    onChange(false);
  }

  return (
    <div className="flex items-center justify-between bg-ink-800 border border-ink-700 rounded-lg px-5 py-4 mb-6">
      <div>
        <p className="text-sm text-paper font-medium">Slack alerts</p>
        <p className="text-sm text-slate-400">
          {connected
            ? "Connected — you'll get a live message the moment a sender hits its hourly limit."
            : "Connect Slack to get notified the moment a sender hits its hourly limit."}
        </p>
      </div>
      {connected ? (
        <Button variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
      ) : (
        <a href={api.slackConnectUrl()}>
          <Button variant="secondary">Connect Slack</Button>
        </a>
      )}
    </div>
  );
}
