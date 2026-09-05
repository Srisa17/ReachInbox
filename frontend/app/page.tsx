"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Left: the pipeline visual — the most characteristic thing in this
            product's world is a stream of emails moving through timed
            windows, not a generic hero illustration. */}
        <section className="hidden lg:flex items-center justify-center border-r border-ink-700 bg-ink-950 p-16">
          <PipelineGraphic />
        </section>

        {/* Right: the sign-in surface */}
        <section className="flex items-center justify-center p-8">
          <div className="w-full max-w-sm">
            <p className="text-sm text-slate-400 mb-2">ReachInbox</p>
            <h1 className="text-4xl leading-tight font-semibold text-paper mb-3">
              Send at the exact
              <br />
              second it matters.
            </h1>
            <p className="text-slate-300 mb-10 leading-relaxed">
              Schedule cold-email campaigns that survive restarts, respect
              provider limits, and never send the same message twice.
            </p>

            <button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="w-full flex items-center justify-center gap-3 rounded-md bg-paper text-ink-900 font-medium py-3 hover:bg-white transition-colors"
            >
              <GoogleMark />
              Continue with Google
            </button>

            <p className="text-xs text-slate-400 mt-6 leading-relaxed">
              We use Google only to confirm who you are. Your campaigns and
              sender identities stay in your own ReachInbox workspace.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function PipelineGraphic() {
  const dots = [
    { x: 40, sent: true },
    { x: 100, sent: true },
    { x: 160, sent: true },
    { x: 240, sent: false },
    { x: 320, sent: false },
    { x: 420, sent: false },
  ];

  return (
    <svg viewBox="0 0 480 220" className="w-full max-w-md" role="img" aria-label="Email send pipeline">
      <line x1="20" y1="110" x2="460" y2="110" stroke="#2B3040" strokeWidth="2" />
      {dots.map((d, i) => (
        <g key={i}>
          <circle
            cx={d.x}
            cy={110}
            r={d.sent ? 7 : 6}
            fill={d.sent ? "#F5A623" : "#171A21"}
            stroke={d.sent ? "none" : "#4FD1C5"}
            strokeWidth={d.sent ? 0 : 2}
          />
        </g>
      ))}
      <text x="20" y="70" fill="#8B93A7" fontSize="13">
        sent
      </text>
      <text x="230" y="70" fill="#4FD1C5" fontSize="13">
        queued for 2:00pm window
      </text>
      <text x="20" y="160" fill="#8B93A7" fontSize="12">
        Hourly cap keeps every sender under its limit — nothing is dropped,
      </text>
      <text x="20" y="180" fill="#8B93A7" fontSize="12">
        only rescheduled into the next open window.
      </text>
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.2 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.2 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.3 35.4 26.8 36 24 36c-5.2 0-9.6-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.3C40.9 36.5 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
