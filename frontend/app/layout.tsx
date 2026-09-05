import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReachInbox Scheduler",
  description: "Schedule and send cold-email campaigns reliably, at scale.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-ink-900 text-paper min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
