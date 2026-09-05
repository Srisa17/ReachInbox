"use client";

import { SentEmailItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";

export function SentTable({ emails, loading }: { emails: SentEmailItem[]; loading: boolean }) {
  if (loading) return <Spinner label="Loading sent emails…" />;

  if (emails.length === 0) {
    return (
      <EmptyState
        title="No emails sent yet"
        hint="Once scheduled emails go out, they'll land here with their delivery status."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-ink-700">
            <th className="py-3 pr-4 font-normal">Email</th>
            <th className="py-3 pr-4 font-normal">Subject</th>
            <th className="py-3 pr-4 font-normal">Sent time</th>
            <th className="py-3 pr-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => (
            <tr key={email.id} className="border-b border-ink-800 hover:bg-ink-800/40">
              <td className="py-3 pr-4">{email.toEmail}</td>
              <td className="py-3 pr-4 text-slate-300">{email.subject}</td>
              <td className="py-3 pr-4 font-mono text-slate-300">
                {email.sentAt ? new Date(email.sentAt).toLocaleString() : "—"}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={email.status} />
                {email.status === "FAILED" && email.errorMessage && (
                  <p className="text-xs text-rose-400 mt-1 max-w-xs truncate">
                    {email.errorMessage}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
